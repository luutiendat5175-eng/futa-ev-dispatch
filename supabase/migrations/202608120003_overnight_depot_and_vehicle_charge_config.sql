-- Upgrade existing Dispatch Core installations to the confirmed import model.
-- PA đậu đêm stores route end + overnight depot + station + planned count + mobilization time.
-- Charging duration belongs to vehicle type, never to PA rows.

create table if not exists public.vehicle_types (
  code text primary key,
  charge_minutes integer not null check (charge_minutes >= 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.vehicles rename column vehicle_type to vehicle_type_code;
exception when undefined_column then null; end $$;

do $$ begin
  alter table public.vehicles
    add constraint vehicles_vehicle_type_code_fkey
    foreign key (vehicle_type_code) references public.vehicle_types(code);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.plan_route_ends rename column depot_id to overnight_depot_id;
exception when undefined_column then null; end $$;

alter table public.plan_route_ends drop column if exists charge_minutes;
alter table public.plan_route_ends drop column if exists distance_to_station_km;
alter table public.plan_route_ends drop column if exists distance_from_station_km;

-- Coordinates are used by the yard map and GPS checks; two decimal places is
-- not sufficient for a real station/depot location.
alter table public.depots alter column x type numeric(10,7);
alter table public.depots alter column y type numeric(10,7);
alter table public.charging_stations alter column x type numeric(10,7);
alter table public.charging_stations alter column y type numeric(10,7);

create or replace function public.generate_lct_dispatch_tasks(p_daily_plan_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare plan_status public.daily_plan_status; generated_count integer;
begin
  select status into plan_status from public.daily_plans where id = p_daily_plan_id for update;
  if plan_status is distinct from 'draft' then raise exception 'DAILY_PLAN_LOCKED'; end if;

  delete from public.dispatch_tasks
   where daily_plan_id = p_daily_plan_id and task_type = 'di_chuyen' and assigned_profile_id is null;

  insert into public.dispatch_tasks (
    daily_plan_id, daily_vehicle_schedule_id, task_type, status, priority_lct_at,
    vehicle_id, from_depot_id, to_station_id, eta_at, created_at, updated_at
  )
  select s.daily_plan_id, s.id, 'di_chuyen', 'chua_sac', s.lct_at, s.vehicle_id,
         pre.overnight_depot_id, pre.charging_station_id, s.lct_at, now(), now()
    from public.daily_vehicle_schedules s
    join public.plan_route_ends pre on pre.id = s.plan_route_end_id
   where s.daily_plan_id = p_daily_plan_id
   order by s.lct_at asc;
  get diagnostics generated_count = row_count;
  return generated_count;
end $$;

alter table public.vehicle_types enable row level security;
drop policy if exists "staff read vehicle types" on public.vehicle_types;
drop policy if exists "admins manage vehicle types" on public.vehicle_types;
create policy "staff read vehicle types" on public.vehicle_types
  for select to authenticated using (true);
create policy "admins manage vehicle types" on public.vehicle_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
