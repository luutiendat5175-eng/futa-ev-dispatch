-- Each roster import replaces only its own route. Other routes of the same
-- operating day are untouched, so several dispatchers can import in parallel.
create or replace function public.replace_route_roster(
  p_daily_plan_id uuid,
  p_route_code text,
  p_schedules jsonb
) returns integer language plpgsql security definer set search_path = public as $$
declare generated_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_daily_plan_id::text || ':' || p_route_code));
  if not exists (select 1 from public.daily_plans where id = p_daily_plan_id and status = 'draft') then raise exception 'DAILY_PLAN_LOCKED'; end if;
  if jsonb_typeof(p_schedules) <> 'array' or jsonb_array_length(p_schedules) = 0 then raise exception 'EMPTY_ROUTE_ROSTER'; end if;
  if exists (select 1 from public.dispatch_tasks task join public.daily_vehicle_schedules schedule on schedule.id = task.daily_vehicle_schedule_id join public.plan_route_ends route_end on route_end.id = schedule.plan_route_end_id where task.daily_plan_id = p_daily_plan_id and route_end.route_code = p_route_code and task.assigned_profile_id is not null) then raise exception 'ROUTE_HAS_CLAIMED_TASKS'; end if;
  if exists (select 1 from public.daily_vehicle_schedules schedule join public.plan_route_ends route_end on route_end.id = schedule.plan_route_end_id join jsonb_array_elements(p_schedules) item on (item->>'vehicle_id')::uuid = schedule.vehicle_id where schedule.daily_plan_id = p_daily_plan_id and route_end.route_code <> p_route_code) then raise exception 'VEHICLE_USED_BY_ANOTHER_ROUTE'; end if;
  delete from public.dispatch_tasks task using public.daily_vehicle_schedules schedule, public.plan_route_ends route_end where task.daily_vehicle_schedule_id = schedule.id and schedule.plan_route_end_id = route_end.id and task.daily_plan_id = p_daily_plan_id and route_end.route_code = p_route_code;
  delete from public.daily_vehicle_schedules schedule using public.plan_route_ends route_end where schedule.plan_route_end_id = route_end.id and schedule.daily_plan_id = p_daily_plan_id and route_end.route_code = p_route_code;
  insert into public.daily_vehicle_schedules(daily_plan_id, vehicle_id, plan_route_end_id, earliest_departure_at, lct_at, roster_sequence, source_trip_count)
  select p_daily_plan_id, (item->>'vehicle_id')::uuid, (item->>'plan_route_end_id')::uuid, (item->>'earliest_departure_at')::timestamptz, (item->>'lct_at')::timestamptz, nullif(item->>'roster_sequence','')::integer, coalesce(nullif(item->>'source_trip_count','')::integer, 1) from jsonb_array_elements(p_schedules) item;
  insert into public.dispatch_tasks(daily_plan_id, daily_vehicle_schedule_id, task_type, status, priority_lct_at, vehicle_id, from_depot_id, to_station_id, eta_at, created_at, updated_at)
  select schedule.daily_plan_id, schedule.id, 'di_chuyen', 'chua_sac', schedule.lct_at, schedule.vehicle_id, route_end.overnight_depot_id, route_end.charging_station_id, schedule.lct_at, now(), now() from public.daily_vehicle_schedules schedule join public.plan_route_ends route_end on route_end.id = schedule.plan_route_end_id where schedule.daily_plan_id = p_daily_plan_id and route_end.route_code = p_route_code order by schedule.lct_at asc;
  get diagnostics generated_count = row_count;
  return generated_count;
end $$;
