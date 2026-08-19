-- Safe repair for a partially executed 202608150012 migration.
-- This may be run once in Supabase SQL Editor. It is safe if some steps
-- have already completed.

alter table public.overnight_plan_config_ends
  add column if not exists route_end_key text;
update public.overnight_plan_config_ends
  set route_end_key = route_end_name
  where route_end_key is null;
alter table public.overnight_plan_config_ends
  alter column route_end_key set not null;
alter table public.overnight_plan_config_ends
  drop constraint if exists overnight_plan_config_ends_config_id_route_code_route_end_name_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'overnight_plan_config_ends_config_route_end_key_key') then
    alter table public.overnight_plan_config_ends
      add constraint overnight_plan_config_ends_config_route_end_key_key unique (config_id, route_code, route_end_key);
  end if;
end $$;
create index if not exists overnight_config_ends_key_lookup_idx
  on public.overnight_plan_config_ends (config_id, route_code, route_end_key);

alter table public.plan_route_ends
  add column if not exists route_end_key text;
update public.plan_route_ends set route_end_key = route_end_name where route_end_key is null;
alter table public.plan_route_ends alter column route_end_key set not null;
alter table public.plan_route_ends
  drop constraint if exists plan_route_ends_daily_plan_id_route_code_route_end_name_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plan_route_ends_daily_plan_route_end_key_key') then
    alter table public.plan_route_ends
      add constraint plan_route_ends_daily_plan_route_end_key_key unique (daily_plan_id, route_code, route_end_key);
  end if;
end $$;
create index if not exists plan_route_ends_key_lookup_idx
  on public.plan_route_ends (daily_plan_id, route_code, route_end_key);

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
  insert into public.plan_route_ends(daily_plan_id, route_code, route_name, route_end_name, route_end_key, overnight_depot_id, charging_station_id, planned_vehicle_count, mobilization_minutes, buffer_minutes, metadata)
  select plan_row.id, route_code, route_name, route_end_name, route_end_key, overnight_depot_id, charging_station_id, planned_vehicle_count, mobilization_minutes, buffer_minutes,
    jsonb_build_object('overnight_config_id', config_row.id, 'overnight_config_version', config_row.version)
  from public.overnight_plan_config_ends where config_id = config_row.id;
  insert into public.daily_plan_versions(daily_plan_id, version, imported_by, source_name, payload)
  values (plan_row.id, 1, p_actor_id, 'Snapshot PA co dinh v' || config_row.version, jsonb_build_object('overnight_config_id', config_row.id, 'overnight_config_version', config_row.version));
  return plan_row;
end $$;
