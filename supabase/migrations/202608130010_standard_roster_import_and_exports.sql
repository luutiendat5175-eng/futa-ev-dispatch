-- Keep the vehicle order shown in the organisation's standard duty roster.
alter table public.daily_vehicle_schedules
  add column if not exists roster_sequence integer;

comment on column public.daily_vehicle_schedules.roster_sequence is
  'STT/Tài of the route end in the source duty roster; resets for each route end.';

create index if not exists daily_vehicle_schedules_roster_sequence_idx
  on public.daily_vehicle_schedules (daily_plan_id, plan_route_end_id, roster_sequence);
