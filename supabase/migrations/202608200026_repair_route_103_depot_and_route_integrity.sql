-- Canonicalise the source yard of every dispatch task from the plan snapshot.
-- This repairs data imported before a yard was corrected, without relying on
-- Vietnamese display names (which may have been damaged by a legacy CSV).
do $$
declare
  v_do_muoi_id uuid;
  v_apd_id uuid;
begin
  select id into v_do_muoi_id
    from public.depots
   where code = 'DEPOT-DO-MUOI'
   limit 1;

  select id into v_apd_id
    from public.charging_stations
   where name = 'Trạm sạc An Phú Đông'
   limit 1;

  if v_do_muoi_id is null then
    raise exception 'ROUTE_103_REPAIR_FAILED: missing depot code DEPOT-DO-MUOI';
  end if;
  if v_apd_id is null then
    raise exception 'ROUTE_103_REPAIR_FAILED: missing charging station Trạm sạc An Phú Đông';
  end if;

  -- Route 103 / Đỗ Mười -> An Phú Đông is a distinct physical route.  A
  -- previous import pointed it at a depot record located at the station,
  -- merging it with an unrelated route on the map.
  update public.overnight_plan_config_ends config_end
     set overnight_depot_id = v_do_muoi_id
    from public.overnight_plan_configs config
   where config.id = config_end.config_id
     -- The versioned PA table uses `status`, not `is_active`.
     -- Update every active PA version so a later imported operating date
     -- cannot restore the incorrect source yard.
     and config.status = 'active'
     and config_end.route_code = '103'
     and config_end.charging_station_id = v_apd_id;

  -- Repair all plan snapshots, including the current operating day.  Tasks
  -- that have already been operated keep their events, photos and GPS; only
  -- the source-depot foreign key is corrected.
  update public.plan_route_ends route_end
     set overnight_depot_id = v_do_muoi_id
   where route_end.route_code = '103'
     and route_end.charging_station_id = v_apd_id;

  -- Every task is driven by its own plan-route-end source. This makes every
  -- depot/station pair independent on the map, not only Quang Trung.
  update public.dispatch_tasks task
     set from_depot_id = route_end.overnight_depot_id,
         updated_at = now()
    from public.daily_vehicle_schedules schedule
    join public.plan_route_ends route_end on route_end.id = schedule.plan_route_end_id
   where task.daily_vehicle_schedule_id = schedule.id
     and task.task_type = 'di_chuyen'
     and route_end.overnight_depot_id is not null
     and task.from_depot_id is distinct from route_end.overnight_depot_id;

end $$;

-- Useful diagnostic for future imports. A row marked true has a depot placed
-- at exactly the station coordinates and should be reviewed before dispatch.
create or replace view public.v_dispatch_route_integrity as
select
  plan.service_date,
  route_end.route_code,
  route_end.route_name,
  route_end.route_end_name,
  depot.code as depot_code,
  depot.name as depot_name,
  depot.x as depot_x,
  depot.y as depot_y,
  station.name as station_name,
  station.x as station_x,
  station.y as station_y,
  (abs(depot.x - station.x) < 0.00001 and abs(depot.y - station.y) < 0.00001) as depot_same_as_station
from public.plan_route_ends route_end
join public.daily_plans plan on plan.id = route_end.daily_plan_id
join public.depots depot on depot.id = route_end.overnight_depot_id
join public.charging_stations station on station.id = route_end.charging_station_id;

grant select on public.v_dispatch_route_integrity to authenticated;
