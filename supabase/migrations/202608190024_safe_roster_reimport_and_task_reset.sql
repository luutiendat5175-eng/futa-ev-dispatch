-- Re-importing a route must never erase evidence. Rows with task events stay;
-- only untouched rows of that route are replaced by the new roster.
create or replace function public.replace_route_roster(
  p_daily_plan_id uuid, p_route_code text, p_schedules jsonb
) returns integer language plpgsql security definer set search_path = public as $$
declare generated_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_daily_plan_id::text || ':' || p_route_code));
  if not exists (select 1 from public.daily_plans where id = p_daily_plan_id and status = 'draft') then raise exception 'DAILY_PLAN_LOCKED'; end if;
  if jsonb_typeof(p_schedules) <> 'array' or jsonb_array_length(p_schedules) = 0 then raise exception 'EMPTY_ROUTE_ROSTER'; end if;

  if exists (
    select 1 from public.dispatch_tasks task
    join public.daily_vehicle_schedules schedule on schedule.id = task.daily_vehicle_schedule_id
    join public.plan_route_ends route_end on route_end.id = schedule.plan_route_end_id
    join jsonb_array_elements(p_schedules) item on (item ->> 'vehicle_id')::uuid = schedule.vehicle_id
    where task.daily_plan_id = p_daily_plan_id and route_end.route_code <> p_route_code
      and task.status not in ('hoan_thanh', 'qua_han')
  ) then raise exception 'VEHICLE_USED_BY_ANOTHER_ROUTE'; end if;

  -- Only never-operated, unclaimed tasks may be deleted and rebuilt.
  delete from public.dispatch_tasks task
  using public.daily_vehicle_schedules schedule, public.plan_route_ends route_end
  where task.daily_vehicle_schedule_id = schedule.id and schedule.plan_route_end_id = route_end.id
    and task.daily_plan_id = p_daily_plan_id and route_end.route_code = p_route_code
    and task.assigned_profile_id is null
    and not exists (select 1 from public.task_events event where event.task_id = task.id);

  -- Keep schedules referenced by an historical task; they are its audit trail.
  delete from public.daily_vehicle_schedules schedule
  using public.plan_route_ends route_end
  where schedule.plan_route_end_id = route_end.id and schedule.daily_plan_id = p_daily_plan_id
    and route_end.route_code = p_route_code
    and not exists (select 1 from public.dispatch_tasks task where task.daily_vehicle_schedule_id = schedule.id);

  -- A bus with historical data in this operating day is not recreated.
  insert into public.daily_vehicle_schedules(daily_plan_id, vehicle_id, plan_route_end_id, earliest_departure_at, lct_at, roster_sequence, source_trip_count)
  select p_daily_plan_id, (item ->> 'vehicle_id')::uuid, (item ->> 'plan_route_end_id')::uuid,
    (item ->> 'earliest_departure_at')::timestamptz, (item ->> 'lct_at')::timestamptz,
    nullif(item ->> 'roster_sequence', '')::integer, coalesce(nullif(item ->> 'source_trip_count', '')::integer, 1)
  from jsonb_array_elements(p_schedules) item
  where not exists (
    select 1 from public.daily_vehicle_schedules schedule
    where schedule.daily_plan_id = p_daily_plan_id and schedule.vehicle_id = (item ->> 'vehicle_id')::uuid
  );

  insert into public.dispatch_tasks(daily_plan_id, daily_vehicle_schedule_id, task_type, status, priority_lct_at, vehicle_id, from_depot_id, to_station_id, eta_at, created_at, updated_at)
  select schedule.daily_plan_id, schedule.id, 'di_chuyen', 'chua_sac', schedule.lct_at,
    schedule.vehicle_id, route_end.overnight_depot_id, route_end.charging_station_id, schedule.lct_at, now(), now()
  from public.daily_vehicle_schedules schedule join public.plan_route_ends route_end on route_end.id = schedule.plan_route_end_id
  where schedule.daily_plan_id = p_daily_plan_id and route_end.route_code = p_route_code
    and not exists (select 1 from public.dispatch_tasks task where task.daily_vehicle_schedule_id = schedule.id);
  get diagnostics generated_count = row_count;
  return generated_count;
end $$;

-- Soft-delete for an emergency reset: task history, GPS and photos are kept.
create or replace function public.admin_archive_plan_tasks(p_daily_plan_id uuid, p_actor_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  update public.dispatch_tasks
     set status = 'qua_han', assigned_profile_id = null, updated_at = now()
   where daily_plan_id = p_daily_plan_id and task_type = 'di_chuyen' and status <> 'qua_han';
  get diagnostics changed = row_count;
  insert into public.audit_logs(actor_profile_id, action, entity_type, entity_id, after_data)
  values (p_actor_id, 'archive_dispatch_tasks', 'daily_plan', p_daily_plan_id, jsonb_build_object('archived_tasks', changed));
  return changed;
end $$;

revoke all on function public.admin_archive_plan_tasks(uuid, uuid) from public;
grant execute on function public.admin_archive_plan_tasks(uuid, uuid) to service_role;
