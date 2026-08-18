-- PA đậu đêm is a long-lived operating configuration. Daily plans only retain
-- a snapshot of the active configuration used on that operating date.

do $$ begin
  create type public.overnight_config_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

create table if not exists public.overnight_plan_configs (
  id uuid primary key default gen_random_uuid(),
  version integer not null,
  status public.overnight_config_status not null default 'draft',
  effective_from date not null,
  source_name text,
  note text,
  imported_by uuid references public.profiles(id),
  activated_by uuid references public.profiles(id),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (version)
);

create unique index if not exists one_active_overnight_config
  on public.overnight_plan_configs ((status)) where status = 'active';

create table if not exists public.overnight_plan_config_ends (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references public.overnight_plan_configs(id) on delete cascade,
  route_code text not null,
  route_name text not null,
  route_end_name text not null,
  overnight_depot_id uuid not null references public.depots(id),
  charging_station_id uuid not null references public.charging_stations(id),
  planned_vehicle_count integer not null check (planned_vehicle_count >= 0),
  mobilization_minutes integer not null check (mobilization_minutes >= 0),
  buffer_minutes integer not null default 10 check (buffer_minutes >= 0),
  note text,
  created_at timestamptz not null default now(),
  unique (config_id, route_code, route_end_name)
);

create index if not exists overnight_config_ends_lookup_idx
  on public.overnight_plan_config_ends (config_id, route_code, route_end_name);

-- Initialise a version from the latest already-imported daily PA, if there is
-- no fixed configuration yet. It never overwrites a user-created config.
do $$
declare source_plan uuid; source_date date; next_version integer; config_id uuid;
begin
  if not exists (select 1 from public.overnight_plan_configs) then
    select id, service_date into source_plan, source_date
      from public.daily_plans order by service_date desc limit 1;
    if source_plan is not null then
      select coalesce(max(version), 0) + 1 into next_version from public.overnight_plan_configs;
      insert into public.overnight_plan_configs(version, status, effective_from, source_name, note, activated_at)
      values (next_version, 'active', source_date, 'Da chuyen tu PA ngay da co', 'Du lieu khoi tao; hay doi chieu truoc khi su dung', now())
      returning id into config_id;
      insert into public.overnight_plan_config_ends(config_id, route_code, route_name, route_end_name, overnight_depot_id, charging_station_id, planned_vehicle_count, mobilization_minutes, buffer_minutes)
      select config_id, route_code, route_name, route_end_name, overnight_depot_id, charging_station_id, planned_vehicle_count, mobilization_minutes, buffer_minutes
      from public.plan_route_ends where daily_plan_id = source_plan and overnight_depot_id is not null;
    end if;
  end if;
end $$;

create or replace function public.snapshot_active_overnight_config(
  p_service_date date,
  p_actor_id uuid default null
) returns public.daily_plans
language plpgsql security definer set search_path = public
as $$
declare config_row public.overnight_plan_configs; plan_row public.daily_plans;
begin
  select * into plan_row from public.daily_plans where service_date = p_service_date for update;
  if plan_row.id is not null then return plan_row; end if;
  select * into config_row from public.overnight_plan_configs
    where status = 'active' and effective_from <= p_service_date
    order by effective_from desc limit 1;
  if config_row.id is null then raise exception 'NO_ACTIVE_OVERNIGHT_CONFIG'; end if;
  insert into public.daily_plans(service_date, shift_started_at, shift_ends_at, source_name, imported_by)
  values (p_service_date, (p_service_date - 1)::timestamptz + time '18:00', p_service_date::timestamptz + time '06:00', 'PA co dinh v' || config_row.version, p_actor_id)
  returning * into plan_row;
  insert into public.plan_route_ends(daily_plan_id, route_code, route_name, route_end_name, overnight_depot_id, charging_station_id, planned_vehicle_count, mobilization_minutes, buffer_minutes, metadata)
  select plan_row.id, route_code, route_name, route_end_name, overnight_depot_id, charging_station_id, planned_vehicle_count, mobilization_minutes, buffer_minutes,
    jsonb_build_object('overnight_config_id', config_row.id, 'overnight_config_version', config_row.version)
  from public.overnight_plan_config_ends where config_id = config_row.id;
  insert into public.daily_plan_versions(daily_plan_id, version, imported_by, source_name, payload)
  values (plan_row.id, 1, p_actor_id, 'Snapshot PA co dinh v' || config_row.version, jsonb_build_object('overnight_config_id', config_row.id, 'overnight_config_version', config_row.version));
  return plan_row;
end $$;

alter table public.overnight_plan_configs enable row level security;
alter table public.overnight_plan_config_ends enable row level security;
drop policy if exists "staff read overnight config" on public.overnight_plan_configs;
drop policy if exists "staff read overnight config ends" on public.overnight_plan_config_ends;
create policy "staff read overnight config" on public.overnight_plan_configs for select to authenticated using (true);
create policy "staff read overnight config ends" on public.overnight_plan_config_ends for select to authenticated using (true);
