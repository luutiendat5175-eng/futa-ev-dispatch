-- Station-scoped operational violations, dashboard notifications and a Zalo outbox.
-- No token is stored in the database. Zalo delivery is performed by a server-side worker.

alter table public.station_time_rules
  add column if not exists zalo_group_label text,
  add column if not exists zalo_chat_id text,
  add column if not exists violation_pilot_enabled boolean not null default false;

create table if not exists public.station_priority_windows (
  id uuid primary key default gen_random_uuid(),
  charging_station_id uuid not null references public.charging_stations(id) on delete cascade,
  starts_at time not null,
  ends_at time not null,
  priority_min integer not null check (priority_min > 0),
  priority_max integer not null check (priority_max >= priority_min),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(charging_station_id, starts_at, ends_at)
);

create table if not exists public.violation_cases (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  violation_type text not null check (violation_type in ('priority_window','movement_timeout','station_wait_timeout','receive_gap_timeout')),
  task_id uuid references public.dispatch_tasks(id) on delete restrict,
  trigger_event_id uuid references public.task_events(id) on delete restrict,
  daily_plan_id uuid references public.daily_plans(id) on delete restrict,
  charging_station_id uuid references public.charging_stations(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  recurrence_count integer not null default 1,
  message text not null,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists violation_cases_station_detected_idx on public.violation_cases(charging_station_id, detected_at desc);
create index if not exists violation_cases_profile_detected_idx on public.violation_cases(profile_id, detected_at desc);

create table if not exists public.violation_dashboard_alerts (
  id uuid primary key default gen_random_uuid(),
  violation_case_id uuid not null unique references public.violation_cases(id) on delete cascade,
  charging_station_id uuid references public.charging_stations(id) on delete cascade,
  is_acknowledged boolean not null default false,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.zalo_violation_outbox (
  id uuid primary key default gen_random_uuid(),
  violation_case_id uuid not null unique references public.violation_cases(id) on delete cascade,
  charging_station_id uuid references public.charging_stations(id) on delete cascade,
  group_label text,
  chat_id text,
  message text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.station_priority_windows enable row level security;
alter table public.violation_cases enable row level security;
alter table public.violation_dashboard_alerts enable row level security;
alter table public.zalo_violation_outbox enable row level security;

drop policy if exists "admins manage station priority windows" on public.station_priority_windows;
create policy "admins manage station priority windows" on public.station_priority_windows for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "staff view permitted violation cases" on public.violation_cases;
create policy "staff view permitted violation cases" on public.violation_cases for select to authenticated using (public.is_dispatch_manager() or profile_id = auth.uid() or public.can_access_station(charging_station_id));
drop policy if exists "staff view permitted violation alerts" on public.violation_dashboard_alerts;
create policy "staff view permitted violation alerts" on public.violation_dashboard_alerts for select to authenticated using (public.is_dispatch_manager() or public.can_access_station(charging_station_id));

create or replace function public.open_violation_case(
  p_idempotency_key text, p_type text, p_task_id uuid, p_trigger_event_id uuid,
  p_daily_plan_id uuid, p_station_id uuid, p_profile_id uuid, p_vehicle_id uuid,
  p_message text, p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare case_id uuid; repeated integer;
begin
  select id into case_id from public.violation_cases where idempotency_key=p_idempotency_key;
  if case_id is not null then return case_id; end if;
  select count(*) + 1 into repeated from public.violation_cases
    where profile_id=p_profile_id and violation_type=p_type and detected_at >= now() - interval '30 days';
  insert into public.violation_cases(idempotency_key,violation_type,task_id,trigger_event_id,daily_plan_id,charging_station_id,profile_id,vehicle_id,recurrence_count,message,metadata)
  values(p_idempotency_key,p_type,p_task_id,p_trigger_event_id,p_daily_plan_id,p_station_id,p_profile_id,p_vehicle_id,repeated,p_message,p_metadata)
  returning id into case_id;
  insert into public.violation_dashboard_alerts(violation_case_id,charging_station_id) values(case_id,p_station_id);
  insert into public.zalo_violation_outbox(violation_case_id,charging_station_id,group_label,chat_id,message)
  select case_id, rule.charging_station_id, coalesce(rule.zalo_group_label,'EV DISPATCH'), rule.zalo_chat_id,
    '[CẢNH BÁO VI PHẠM]' || E'\nHọ tên: ' || coalesce(profile.full_name,'—') || E'\nMã NV: ' || coalesce(profile.employee_code,'—') || E'\nLỗi vi phạm: ' || p_message || case when repeated > 1 then E'\nTái phạm lần ' || repeated || ' trong 30 ngày.' else '' end
  from public.station_time_rules rule join public.profiles profile on profile.id=p_profile_id
  where rule.charging_station_id=p_station_id and rule.violation_pilot_enabled
  order by (rule.depot_id is null) asc
  limit 1
  on conflict (violation_case_id) do nothing;
  return case_id;
end $$;

-- Writes priority-window violations after a task is claimed. A task's station priority
-- is its row number by LCT inside the same station and operating plan.
create or replace function public.record_priority_violation_for_claim(p_task_id uuid, p_actor_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare task_row record; rule_row record; v_current_time time; task_priority integer; v_id uuid;
begin
  select task.id,task.daily_plan_id,task.to_station_id,task.vehicle_id,task.priority_lct_at
  into task_row from public.dispatch_tasks task where task.id=p_task_id;
  if task_row.id is null then return null; end if;
  v_current_time := (now() at time zone 'Asia/Ho_Chi_Minh')::time;
  select priority_window.* into rule_row from public.station_priority_windows priority_window
   where priority_window.charging_station_id=task_row.to_station_id and priority_window.is_active
     and ((priority_window.starts_at <= priority_window.ends_at and v_current_time >= priority_window.starts_at and v_current_time < priority_window.ends_at)
       or (priority_window.starts_at > priority_window.ends_at and (v_current_time >= priority_window.starts_at or v_current_time < priority_window.ends_at)))
   order by priority_window.starts_at desc limit 1;
  if rule_row.id is null then return null; end if;
  -- Calculate the task's rank across all movable vehicles of this station.
  select ranked.rank into task_priority from (
    select id,row_number() over(order by priority_lct_at asc nulls last,id) as rank
    from public.dispatch_tasks where daily_plan_id=task_row.daily_plan_id and to_station_id=task_row.to_station_id and task_type='di_chuyen'
  ) ranked where ranked.id=task_row.id;
  if task_priority < rule_row.priority_min or task_priority > rule_row.priority_max then
    v_id := public.open_violation_case(
      'priority:' || task_row.id || ':' || (now() at time zone 'Asia/Ho_Chi_Minh')::date || ':' || rule_row.id,
      'priority_window',task_row.id,null,task_row.daily_plan_id,task_row.to_station_id,p_actor_id,task_row.vehicle_id,
      format('Nhận xe ưu tiên %s ngoài khung cho phép ưu tiên %s–%s.',task_priority,rule_row.priority_min,rule_row.priority_max),
      jsonb_build_object('priority',task_priority,'priority_min',rule_row.priority_min,'priority_max',rule_row.priority_max,'window_start',rule_row.starts_at,'window_end',rule_row.ends_at)
    );
  end if;
  return v_id;
end $$;

-- Convert timeout records created by the existing time-rule check into persistent violations.
create or replace function public.refresh_violation_cases(p_daily_plan_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare alert_row record; created integer := 0; key text;
begin
  perform public.refresh_operational_alerts(p_daily_plan_id);
  update public.violation_cases violation set resolved_at=now()
    from public.operational_alerts alert
    where violation.trigger_event_id=alert.task_event_id and violation.resolved_at is null and alert.resolved_at is not null;
  for alert_row in
    select alert.*, task.daily_plan_id, task.vehicle_id
    from public.operational_alerts alert join public.dispatch_tasks task on task.id=alert.task_id
    where task.daily_plan_id=p_daily_plan_id and alert.resolved_at is null
  loop
    key := 'timeout:' || alert_row.id;
    if not exists(select 1 from public.violation_cases where idempotency_key=key) then
      perform public.open_violation_case(key,alert_row.alert_type,alert_row.task_id,alert_row.task_event_id,alert_row.daily_plan_id,alert_row.charging_station_id,alert_row.profile_id,alert_row.vehicle_id,alert_row.message,jsonb_build_object('due_at',alert_row.due_at));
      created := created + 1;
    end if;
  end loop;
  return created;
end $$;

-- Extend the existing claim operation: it still enforces its existing safety checks,
-- then records (but does not block) a priority violation for the claimed task.
create or replace function public.claim_dispatch_task(p_task_id uuid)
returns public.dispatch_tasks language plpgsql security definer set search_path = public as $$
declare task public.dispatch_tasks; claimed public.dispatch_tasks; active_task uuid; last_return_at timestamptz; receive_gap integer := 0;
begin
  if public.current_role() not in ('lai_xe', 'admin') then raise exception 'TASK_CLAIM_FORBIDDEN'; end if;
  select * into task from public.dispatch_tasks where id = p_task_id for update;
  if task.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  if task.status not in ('chua_sac', 'moi') then raise exception 'TASK_NOT_AVAILABLE'; end if;
  if task.assigned_profile_id is not null and task.assigned_profile_id <> auth.uid() then raise exception 'TASK_ALREADY_CLAIMED'; end if;
  if public.current_role() <> 'admin' and not public.can_access_station(task.to_station_id) then raise exception 'TASK_STATION_NOT_ASSIGNED'; end if;
  select id into active_task from public.dispatch_tasks where assigned_profile_id=auth.uid() and task_type='di_chuyen'
    and status in ('nhan_xe_dau_ben','giao_tram_sac','doi_sac','nhan_tram_sac') limit 1 for update;
  if active_task is not null and active_task <> task.id then raise exception 'EMPLOYEE_ACTIVE_TASK'; end if;
  select coalesce(pair.min_receive_gap_minutes,station.min_receive_gap_minutes,0) into receive_gap from public.charging_stations s
    left join public.station_time_rules station on station.charging_station_id=s.id and station.depot_id is null and station.is_active
    left join public.station_time_rules pair on pair.charging_station_id=s.id and pair.depot_id=task.from_depot_id and pair.is_active where s.id=task.to_station_id;
  select occurred_at into last_return_at from public.task_events where actor_profile_id=auth.uid() and to_status in ('giao_dau_ben','hoan_thanh') order by occurred_at desc limit 1;
  if last_return_at is not null and now() < last_return_at + make_interval(mins => coalesce(receive_gap,0)) then raise exception 'EMPLOYEE_RECEIVE_COOLDOWN:%', ceil(extract(epoch from (last_return_at + make_interval(mins => receive_gap) - now())) / 60.0); end if;
  update public.dispatch_tasks set assigned_profile_id=auth.uid(), assigned_by=auth.uid(), updated_at=now() where id=task.id returning * into claimed;
  perform public.record_priority_violation_for_claim(claimed.id,auth.uid());
  return claimed;
end $$;

-- Pilot configuration: An Phú Đông / Quang Trung pair.
insert into public.station_time_rules(charging_station_id,depot_id,outbound_minutes,return_minutes,station_wait_minutes,min_receive_gap_minutes,zalo_group_label,violation_pilot_enabled)
select station.id,depot.id,25,30,30,10,'EV DISPATCH',true
from public.charging_stations station cross join public.depots depot
where station.name='Trạm sạc An Phú Đông'
  and depot.name='Quang Trung'
on conflict (charging_station_id,depot_id) where depot_id is not null do update
set outbound_minutes=excluded.outbound_minutes,return_minutes=excluded.return_minutes,station_wait_minutes=excluded.station_wait_minutes,min_receive_gap_minutes=excluded.min_receive_gap_minutes,zalo_group_label=excluded.zalo_group_label,violation_pilot_enabled=true,updated_at=now();

insert into public.station_priority_windows(charging_station_id,starts_at,ends_at,priority_min,priority_max,is_active)
select station.id, source.starts_at,source.ends_at,source.priority_min,source.priority_max,true
from public.charging_stations station cross join (values
  ('20:00'::time,'02:00'::time,1,70),('02:00'::time,'03:00'::time,70,110)
) as source(starts_at,ends_at,priority_min,priority_max)
where station.name='Trạm sạc An Phú Đông'
on conflict(charging_station_id,starts_at,ends_at) do update set priority_min=excluded.priority_min,priority_max=excluded.priority_max,is_active=true,updated_at=now();
