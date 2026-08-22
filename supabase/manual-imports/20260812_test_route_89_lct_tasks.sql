-- Test import: Route 89, service date 2026-08-12.
-- Shift: 18:00 on 2026-08-11 through 06:00 on 2026-08-12.
-- Source roster: Bảng Tài.csv. Each of the 13 buses has 12 roster trips.
-- The earliest departure across both end blocks selects its operational start end.

begin;

do $$
begin
  if exists (
    select 1 from public.daily_plans
    where service_date = date '2026-08-12' and status <> 'draft'
  ) then
    raise exception 'DAILY_PLAN_LOCKED: kế hoạch 2026-08-12 đã khóa hoặc được thay thế';
  end if;

  if not exists (select 1 from public.depots where code = 'DEPOT-VAN-THANH')
     or not exists (select 1 from public.depots where code = 'DEPOT-NONG-LAM')
     or not exists (select 1 from public.charging_stations where code = 'TRAM-QUANG-THUAN')
     or not exists (select 1 from public.charging_stations where code = 'TRAM-KHANG-VIET') then
    raise exception 'MASTER_DATA_MISSING: chạy script import bãi và trạm trước';
  end if;
end $$;

insert into public.vehicles (license_plate, vehicle_type_code)
values
  ('50E20936', 'B60'), ('50E21141', 'B60'), ('50E21208', 'B60'),
  ('50E21792', 'B60'), ('50E21837', 'B60'), ('50E21981', 'B60'),
  ('50E22416', 'B60'), ('50E22433', 'B60'), ('50F02034', 'B60'),
  ('50H88587', 'B60'), ('50H88781', 'B60'), ('50H88813', 'B60'),
  ('50H89271', 'B60')
on conflict (license_plate) do update
set vehicle_type_code = excluded.vehicle_type_code,
    is_active = true;

insert into public.daily_plans (
  service_date, shift_started_at, shift_ends_at, status, source_name
)
values (
  date '2026-08-12',
  timestamptz '2026-08-11 18:00:00+07',
  timestamptz '2026-08-12 06:00:00+07',
  'draft',
  'Bảng Tài tuyến 89 - 12/08/2026'
)
on conflict (service_date) do update
set source_name = excluded.source_name,
    updated_at = now()
where public.daily_plans.status = 'draft';

with plan as (
  select id from public.daily_plans where service_date = date '2026-08-12'
), config as (
  select
    plan.id as daily_plan_id,
    values_row.route_end_name,
    values_row.overnight_depot_code,
    values_row.station_code,
    values_row.planned_vehicle_count,
    values_row.mobilization_minutes
  from plan
  cross join (
    values
      ('Bến tàu Hiệp Bình Chánh', 'DEPOT-VAN-THANH', 'TRAM-QUANG-THUAN', 6, 11),
      ('ĐH Nông Lâm', 'DEPOT-NONG-LAM', 'TRAM-KHANG-VIET', 7, 6)
  ) as values_row(route_end_name, overnight_depot_code, station_code, planned_vehicle_count, mobilization_minutes)
)
insert into public.plan_route_ends (
  daily_plan_id, route_code, route_name, route_end_name, overnight_depot_id,
  charging_station_id, planned_vehicle_count, mobilization_minutes, buffer_minutes, metadata
)
select
  config.daily_plan_id, '89', 'Đại học Nông Lâm - Bến tàu Hiệp Bình Chánh',
  config.route_end_name, depot.id, station.id, config.planned_vehicle_count,
  config.mobilization_minutes, 10,
  jsonb_build_object('source', 'PA đậu đêm', 'actual_roster_comparison', true)
from config
join public.depots depot on depot.code = config.overnight_depot_code
join public.charging_stations station on station.code = config.station_code
on conflict (daily_plan_id, route_code, route_end_name) do update
set overnight_depot_id = excluded.overnight_depot_id,
    charging_station_id = excluded.charging_station_id,
    planned_vehicle_count = excluded.planned_vehicle_count,
    mobilization_minutes = excluded.mobilization_minutes,
    buffer_minutes = excluded.buffer_minutes,
    metadata = excluded.metadata;

with roster(license_plate, route_end_name, earliest_departure, source_trip_count) as (
  values
    ('50E20936', 'ĐH Nông Lâm', time '05:24', 12),
    ('50E21141', 'Bến tàu Hiệp Bình Chánh', time '05:36', 12),
    ('50E21208', 'ĐH Nông Lâm', time '05:00', 12),
    ('50E21792', 'Bến tàu Hiệp Bình Chánh', time '05:00', 12),
    ('50E21837', 'ĐH Nông Lâm', time '05:36', 12),
    ('50E21981', 'ĐH Nông Lâm', time '05:48', 12),
    ('50E22416', 'ĐH Nông Lâm', time '05:12', 12),
    ('50E22433', 'Bến tàu Hiệp Bình Chánh', time '05:24', 12),
    ('50F02034', 'Bến tàu Hiệp Bình Chánh', time '05:12', 12),
    ('50H88587', 'Bến tàu Hiệp Bình Chánh', time '06:10', 12),
    ('50H88781', 'Bến tàu Hiệp Bình Chánh', time '05:48', 12),
    ('50H88813', 'Bến tàu Hiệp Bình Chánh', time '06:00', 12),
    ('50H89271', 'ĐH Nông Lâm', time '06:00', 12)
), plan as (
  select id, service_date from public.daily_plans where service_date = date '2026-08-12'
)
insert into public.daily_vehicle_schedules (
  daily_plan_id, vehicle_id, plan_route_end_id, earliest_departure_at, lct_at,
  source_trip_count, metadata
)
select
  plan.id,
  vehicle.id,
  route_end.id,
  ((plan.service_date + roster.earliest_departure) at time zone 'Asia/Ho_Chi_Minh'),
  ((plan.service_date + roster.earliest_departure
      - make_interval(mins => vehicle_type.charge_minutes + route_end.mobilization_minutes + route_end.buffer_minutes))
    at time zone 'Asia/Ho_Chi_Minh'),
  roster.source_trip_count,
  jsonb_build_object('source', 'Bảng Tài.csv', 'rule', 'earliest departure across both ends')
from roster
join plan on true
join public.vehicles vehicle on vehicle.license_plate = roster.license_plate
join public.vehicle_types vehicle_type on vehicle_type.code = vehicle.vehicle_type_code
join public.plan_route_ends route_end on route_end.daily_plan_id = plan.id
  and route_end.route_code = '89' and route_end.route_end_name = roster.route_end_name
on conflict (daily_plan_id, vehicle_id, plan_route_end_id) do update
set earliest_departure_at = excluded.earliest_departure_at,
    lct_at = excluded.lct_at,
    source_trip_count = excluded.source_trip_count,
    metadata = excluded.metadata;

select public.generate_lct_dispatch_tasks(
  (select id from public.daily_plans where service_date = date '2026-08-12')
) as generated_task_count;

-- Review: LCT ascending is the dispatch priority. Actual roster count is
-- deliberately compared against PA planned_vehicle_count, not forced to equal it.
select
  task.priority_lct_at at time zone 'Asia/Ho_Chi_Minh' as lct,
  vehicle.license_plate,
  route_end.route_end_name,
  depot.name as overnight_depot,
  station.name as charging_station,
  route_end.planned_vehicle_count
from public.dispatch_tasks task
join public.vehicles vehicle on vehicle.id = task.vehicle_id
join public.daily_vehicle_schedules schedule on schedule.id = task.daily_vehicle_schedule_id
join public.plan_route_ends route_end on route_end.id = schedule.plan_route_end_id
left join public.depots depot on depot.id = task.from_depot_id
join public.charging_stations station on station.id = task.to_station_id
where task.daily_plan_id = (select id from public.daily_plans where service_date = date '2026-08-12')
  and task.task_type = 'di_chuyen'
order by task.priority_lct_at asc;

commit;
