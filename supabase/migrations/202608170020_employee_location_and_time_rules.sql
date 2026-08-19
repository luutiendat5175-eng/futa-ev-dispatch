-- Operational time controls. A station can have a default rule and, where
-- necessary, a stricter rule for one specific depot <-> station pair.
create table if not exists public.station_time_rules (
  id uuid primary key default gen_random_uuid(),
  charging_station_id uuid not null references public.charging_stations(id) on delete cascade,
  depot_id uuid references public.depots(id) on delete cascade,
  outbound_minutes integer not null default 30 check (outbound_minutes > 0),
  return_minutes integer not null default 35 check (return_minutes > 0),
  station_wait_minutes integer not null default 30 check (station_wait_minutes > 0),
  depot_wait_minutes integer not null default 30 check (depot_wait_minutes > 0),
  min_receive_gap_minutes integer not null default 10 check (min_receive_gap_minutes >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists station_time_rules_default_unique on public.station_time_rules(charging_station_id) where depot_id is null;
create unique index if not exists station_time_rules_pair_unique on public.station_time_rules(charging_station_id, depot_id) where depot_id is not null;

create table if not exists public.operational_alerts (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.dispatch_tasks(id) on delete restrict,
  task_event_id uuid not null references public.task_events(id) on delete restrict, charging_station_id uuid references public.charging_stations(id),
  profile_id uuid references public.profiles(id), alert_type text not null check (alert_type in ('movement_timeout','station_wait_timeout','depot_wait_timeout')),
  message text not null, due_at timestamptz not null, created_at timestamptz not null default now(), resolved_at timestamptz,
  resolved_by uuid references public.profiles(id), unique(task_event_id, alert_type)
);
alter table public.station_time_rules enable row level security; alter table public.operational_alerts enable row level security;
drop policy if exists "managers manage station time rules" on public.station_time_rules;
create policy "managers manage station time rules" on public.station_time_rules for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "staff view station alerts" on public.operational_alerts;
create policy "staff view station alerts" on public.operational_alerts for select using (public.is_dispatch_manager() or public.can_access_station(charging_station_id) or profile_id = auth.uid());

-- History may contain many jobs, but a driver cannot claim a second vehicle
-- while the first one is at any active point in its movement cycle.
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
  return claimed;
end $$;

-- A later state change automatically resolves the prior timeout alert.
create or replace function public.refresh_operational_alerts(p_daily_plan_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare row record; made integer := 0; limit_minutes integer; kind text; due timestamptz;
begin
  update public.operational_alerts alert set resolved_at=now() from public.task_events later
    where alert.resolved_at is null and later.task_id=alert.task_id and later.occurred_at > (select occurred_at from public.task_events where id=alert.task_event_id);
  for row in with latest as (
    select distinct on (event.actor_profile_id) event.id event_id,event.task_id,event.actor_profile_id,event.to_status,event.occurred_at,task.to_station_id,task.from_depot_id
    from public.task_events event join public.dispatch_tasks task on task.id=event.task_id where task.daily_plan_id=p_daily_plan_id and event.actor_profile_id is not null
    order by event.actor_profile_id,event.occurred_at desc
  ) select * from latest loop
    if row.to_status='nhan_xe_dau_ben' then kind:='movement_timeout'; select coalesce(pair.outbound_minutes,station.outbound_minutes) into limit_minutes from public.station_time_rules station left join public.station_time_rules pair on pair.charging_station_id=row.to_station_id and pair.depot_id=row.from_depot_id and pair.is_active where station.charging_station_id=row.to_station_id and station.depot_id is null and station.is_active limit 1;
    elsif row.to_status='nhan_tram_sac' then kind:='movement_timeout'; select coalesce(pair.return_minutes,station.return_minutes) into limit_minutes from public.station_time_rules station left join public.station_time_rules pair on pair.charging_station_id=row.to_station_id and pair.depot_id=row.from_depot_id and pair.is_active where station.charging_station_id=row.to_station_id and station.depot_id is null and station.is_active limit 1;
    elsif row.to_status in ('giao_tram_sac','doi_sac') then kind:='station_wait_timeout'; select coalesce(pair.station_wait_minutes,station.station_wait_minutes) into limit_minutes from public.station_time_rules station left join public.station_time_rules pair on pair.charging_station_id=row.to_station_id and pair.depot_id=row.from_depot_id and pair.is_active where station.charging_station_id=row.to_station_id and station.depot_id is null and station.is_active limit 1;
    elsif row.to_status in ('giao_dau_ben','hoan_thanh') then kind:='depot_wait_timeout'; select coalesce(pair.depot_wait_minutes,station.depot_wait_minutes) into limit_minutes from public.station_time_rules station left join public.station_time_rules pair on pair.charging_station_id=row.to_station_id and pair.depot_id=row.from_depot_id and pair.is_active where station.charging_station_id=row.to_station_id and station.depot_id is null and station.is_active limit 1;
    else continue; end if;
    if limit_minutes is null then continue; end if; due:=row.occurred_at+make_interval(mins=>limit_minutes);
    if now()>due then insert into public.operational_alerts(task_id,task_event_id,charging_station_id,profile_id,alert_type,message,due_at) values(row.task_id,row.event_id,row.to_station_id,row.actor_profile_id,kind,'Quá thời gian quy định, cần chuyển trạng thái tiếp theo.',due) on conflict(task_event_id,alert_type) do nothing; if found then made:=made+1; end if; end if;
  end loop; return made;
end $$;
