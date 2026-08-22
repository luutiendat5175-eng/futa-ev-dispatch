-- A driver is free immediately after completing a delivery at the depot.
-- The minimum receive gap is intentionally not a post-return cooldown. It is
-- evaluated as an operational warning elsewhere, while an in-progress trip
-- still prevents receiving a second vehicle.
create or replace function public.claim_dispatch_task(p_task_id uuid)
returns public.dispatch_tasks language plpgsql security definer set search_path = public as $$
declare task public.dispatch_tasks; claimed public.dispatch_tasks; active_task uuid;
begin
  if public.current_role() not in ('lai_xe','admin') then raise exception 'TASK_CLAIM_FORBIDDEN'; end if;
  select * into task from public.dispatch_tasks where id=p_task_id for update;
  if task.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  if task.status not in ('chua_sac','moi') then raise exception 'TASK_NOT_AVAILABLE'; end if;
  if task.assigned_profile_id is not null and task.assigned_profile_id<>auth.uid() then raise exception 'TASK_ALREADY_CLAIMED'; end if;
  if public.current_role()<>'admin' and not public.can_access_station(task.to_station_id) then raise exception 'TASK_STATION_NOT_ASSIGNED'; end if;
  select id into active_task from public.dispatch_tasks
    where assigned_profile_id=auth.uid() and task_type='di_chuyen' and id<>task.id
      and status in ('nhan_xe_dau_ben','nhan_tram_sac') limit 1 for update;
  if active_task is not null then raise exception 'EMPLOYEE_ACTIVE_TASK'; end if;
  update public.dispatch_tasks set assigned_profile_id=auth.uid(),assigned_by=auth.uid(),updated_at=now() where id=task.id returning * into claimed;
  perform public.record_priority_violation_for_claim(claimed.id,auth.uid());
  return claimed;
end $$;

-- Returning a vehicle is the final physical action. Keep historic events and
-- photos, but do not force a fifth operational action after it.
create or replace function public.transition_dispatch_task(
  p_task_id uuid, p_next_status public.dispatch_task_status, p_latitude numeric, p_longitude numeric,
  p_accuracy_m numeric default null, p_note text default null
) returns public.task_events language plpgsql security definer set search_path = public as $$
declare task public.dispatch_tasks; allowed boolean:=false; created_event public.task_events; taking_return boolean:=false; other_active_task uuid;
begin
  if p_latitude is null or p_longitude is null then raise exception 'GPS_REQUIRED'; end if;
  select * into task from public.dispatch_tasks where id=p_task_id for update;
  if task.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  taking_return:=task.task_type='di_chuyen' and task.status='giao_tram_sac' and p_next_status='nhan_tram_sac' and public.current_role()='lai_xe' and public.can_access_station(task.to_station_id);
  if not taking_return and task.assigned_profile_id is distinct from auth.uid() and not public.is_dispatch_manager() then raise exception 'TASK_ACTION_FORBIDDEN'; end if;
  if taking_return then
    select id into other_active_task from public.dispatch_tasks where assigned_profile_id=auth.uid() and task_type='di_chuyen' and id<>task.id and status in ('nhan_xe_dau_ben','nhan_tram_sac') limit 1 for update;
    if other_active_task is not null then raise exception 'EMPLOYEE_ACTIVE_TASK'; end if;
  end if;
  if task.task_type='di_chuyen' then
    allowed:=(task.status,p_next_status) in (('chua_sac','nhan_xe_dau_ben'),('nhan_xe_dau_ben','giao_tram_sac'),('giao_tram_sac','nhan_tram_sac'),('nhan_tram_sac','hoan_thanh'),('giao_dau_ben','hoan_thanh'));
  else allowed:=(task.status,p_next_status) in (('moi','dang_xu_ly'),('dang_xu_ly','hoan_thanh')); end if;
  if not allowed then raise exception 'TASK_INVALID_TRANSITION'; end if;
  update public.dispatch_tasks set status=p_next_status,assigned_profile_id=case when taking_return then auth.uid() else assigned_profile_id end,assigned_by=case when taking_return then auth.uid() else assigned_by end,completed_at=case when p_next_status='hoan_thanh' then now() else null end,updated_at=now() where id=task.id;
  insert into public.task_events(task_id,event_type,from_status,to_status,actor_profile_id,latitude,longitude,gps_accuracy_m,note) values(task.id,'transition',task.status,p_next_status,auth.uid(),p_latitude,p_longitude,p_accuracy_m,p_note) returning * into created_event;
  return created_event;
end $$;

-- Old depot-wait alerts represent the removed post-return cooldown.
update public.operational_alerts set resolved_at=now() where resolved_at is null and alert_type='depot_wait_timeout';

-- Only alert while a driver is actually travelling or waiting at a charging
-- station. A completed return places the driver at the depot and must never
-- create a "waiting" alert or block a new task.
create or replace function public.refresh_operational_alerts(p_daily_plan_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare row record; made integer := 0; limit_minutes integer; kind text; due timestamptz;
begin
  update public.operational_alerts alert set resolved_at=now()
  from public.task_events later
  where alert.resolved_at is null
    and later.task_id=alert.task_id
    and later.occurred_at > (select occurred_at from public.task_events where id=alert.task_event_id);

  update public.operational_alerts alert set resolved_at=now()
  from public.dispatch_tasks task
  where alert.resolved_at is null
    and alert.task_id=task.id
    and task.daily_plan_id=p_daily_plan_id
    and task.status='hoan_thanh';

  for row in with latest as (
    select distinct on (event.actor_profile_id)
      event.id event_id,event.task_id,event.actor_profile_id,event.to_status,event.occurred_at,
      task.to_station_id,task.from_depot_id
    from public.task_events event
    join public.dispatch_tasks task on task.id=event.task_id
    where task.daily_plan_id=p_daily_plan_id
      and event.actor_profile_id is not null
      and task.status <> 'hoan_thanh'
    order by event.actor_profile_id,event.occurred_at desc
  ) select * from latest loop
    if row.to_status='nhan_xe_dau_ben' then
      kind:='movement_timeout';
      select coalesce(pair.outbound_minutes,station.outbound_minutes) into limit_minutes
      from public.station_time_rules station
      left join public.station_time_rules pair on pair.charging_station_id=row.to_station_id and pair.depot_id=row.from_depot_id and pair.is_active
      where station.charging_station_id=row.to_station_id and station.depot_id is null and station.is_active limit 1;
    elsif row.to_status='nhan_tram_sac' then
      kind:='movement_timeout';
      select coalesce(pair.return_minutes,station.return_minutes) into limit_minutes
      from public.station_time_rules station
      left join public.station_time_rules pair on pair.charging_station_id=row.to_station_id and pair.depot_id=row.from_depot_id and pair.is_active
      where station.charging_station_id=row.to_station_id and station.depot_id is null and station.is_active limit 1;
    elsif row.to_status in ('giao_tram_sac','doi_sac') then
      kind:='station_wait_timeout';
      select coalesce(pair.station_wait_minutes,station.station_wait_minutes) into limit_minutes
      from public.station_time_rules station
      left join public.station_time_rules pair on pair.charging_station_id=row.to_station_id and pair.depot_id=row.from_depot_id and pair.is_active
      where station.charging_station_id=row.to_station_id and station.depot_id is null and station.is_active limit 1;
    else
      continue;
    end if;
    if limit_minutes is null then continue; end if;
    due:=row.occurred_at+make_interval(mins=>limit_minutes);
    if now()>due then
      insert into public.operational_alerts(task_id,task_event_id,charging_station_id,profile_id,alert_type,message,due_at)
      values(row.task_id,row.event_id,row.to_station_id,row.actor_profile_id,kind,'Quá thời gian quy định, cần chuyển trạng thái tiếp theo.',due)
      on conflict(task_event_id,alert_type) do nothing;
      if found then made:=made+1; end if;
    end if;
  end loop;
  return made;
end $$;
