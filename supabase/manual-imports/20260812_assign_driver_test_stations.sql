-- Test assignment: driver MSNV 12345 can view and self-claim all unassigned
-- tasks at Quang Thuận and Khang Việt for the 2026-08-12 daily plan.
-- A driver may claim multiple tasks; this assignment is not a reservation.

begin;

do $$
begin
  if not exists (select 1 from public.profiles where employee_code = '12345' and role = 'lai_xe') then
    raise exception 'DRIVER_PROFILE_MISSING: cần chạy script chuẩn hóa MSNV trước';
  end if;
  if not exists (select 1 from public.daily_plans where service_date = date '2026-08-12') then
    raise exception 'DAILY_PLAN_MISSING: chưa có kế hoạch test ngày 2026-08-12';
  end if;
end $$;

insert into public.employee_station_assignments (
  daily_plan_id, profile_id, charging_station_id, assigned_by
)
select
  plan.id,
  driver.id,
  station.id,
  admin.id
from public.daily_plans plan
join public.profiles driver on driver.employee_code = '12345'
join public.profiles admin on admin.role = 'admin'
join public.charging_stations station on station.code in ('TRAM-QUANG-THUAN', 'TRAM-KHANG-VIET')
where plan.service_date = date '2026-08-12'
on conflict (daily_plan_id, profile_id, charging_station_id) do nothing;

commit;

select profile.employee_code, station.name as charging_station, plan.service_date
from public.employee_station_assignments assignment
join public.profiles profile on profile.id = assignment.profile_id
join public.charging_stations station on station.id = assignment.charging_station_id
join public.daily_plans plan on plan.id = assignment.daily_plan_id
where plan.service_date = date '2026-08-12'
order by profile.employee_code, station.name;
