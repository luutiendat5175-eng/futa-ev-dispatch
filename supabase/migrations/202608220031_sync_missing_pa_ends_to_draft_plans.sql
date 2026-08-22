-- A daily plan is a stable snapshot, but a newly added route end must be made
-- available while that plan is still draft. Existing rows and history are not
-- overwritten; only missing (route_code, route_end_key) pairs are inserted.
create or replace function public.sync_missing_active_pa_ends_to_draft_plans(p_config_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare inserted_count integer;
begin
  insert into public.plan_route_ends(
    daily_plan_id,route_code,route_name,route_end_name,route_end_key,
    overnight_depot_id,charging_station_id,planned_vehicle_count,
    mobilization_minutes,buffer_minutes,metadata
  )
  select plan.id,config_end.route_code,config_end.route_name,
    config_end.route_end_name,config_end.route_end_key,
    config_end.overnight_depot_id,config_end.charging_station_id,
    config_end.planned_vehicle_count,config_end.mobilization_minutes,
    config_end.buffer_minutes,
    jsonb_build_object('overnight_config_id',config.id,'overnight_config_version',config.version,'synced_missing_end',true)
  from public.overnight_plan_configs config
  join public.overnight_plan_config_ends config_end on config_end.config_id=config.id
  join public.daily_plans plan on plan.status='draft' and plan.service_date>=config.effective_from
  where config.id=p_config_id and config.status='active'
  on conflict(daily_plan_id,route_code,route_end_key) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end $$;

create or replace function public.sync_pa_ends_after_activation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='active' and old.status is distinct from new.status then
    perform public.sync_missing_active_pa_ends_to_draft_plans(new.id);
  end if;
  return new;
end $$;

drop trigger if exists sync_pa_ends_after_activation on public.overnight_plan_configs;
create trigger sync_pa_ends_after_activation
after update of status on public.overnight_plan_configs
for each row execute function public.sync_pa_ends_after_activation();

-- Backfill missing ends for the currently active version immediately.
do $$ declare active_id uuid;
begin
  select id into active_id from public.overnight_plan_configs where status='active' limit 1;
  if active_id is not null then perform public.sync_missing_active_pa_ends_to_draft_plans(active_id);end if;
end $$;
