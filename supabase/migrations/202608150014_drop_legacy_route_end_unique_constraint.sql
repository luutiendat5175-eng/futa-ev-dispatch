-- Final repair for projects where PostgreSQL shortened the legacy constraint
-- name. Drops only the old uniqueness rule (config_id, route_code,
-- route_end_name), preserving all data and the new A/B key rule.

do $$
declare legacy_constraint record;
begin
  for legacy_constraint in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'overnight_plan_config_ends'
      and constraint_type = 'UNIQUE'
      and constraint_name <> 'overnight_plan_config_ends_config_route_end_key_key'
  loop
    -- Only remove a candidate if its definition is the legacy 3-column rule.
    if exists (
      select 1 from pg_constraint c
      where c.conname = legacy_constraint.constraint_name
        and pg_get_constraintdef(c.oid) ilike '%unique (config_id, route_code, route_end_name)%'
    ) then
      execute format('alter table public.overnight_plan_config_ends drop constraint %I', legacy_constraint.constraint_name);
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'overnight_plan_config_ends_config_route_end_key_key') then
    alter table public.overnight_plan_config_ends
      add constraint overnight_plan_config_ends_config_route_end_key_key unique (config_id, route_code, route_end_key);
  end if;
end $$;

-- Verification: this must return only the A/B-key constraint for the
-- configuration table (plus any unrelated constraints).
select conname as constraint_name, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.overnight_plan_config_ends'::regclass
  and contype = 'u';
