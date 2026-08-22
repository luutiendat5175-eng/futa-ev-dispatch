-- Daily operating isolation, permanent station assignments and system announcements.

do $$ begin
  alter type public.dispatch_task_status add value if not exists 'qua_han';
exception when duplicate_object then null; end $$;

create table if not exists public.employee_station_base_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  charging_station_id uuid not null references public.charging_stations(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, charging_station_id)
);

-- Preserve the most recently-created legacy assignment for every employee/station.
insert into public.employee_station_base_assignments (profile_id, charging_station_id, assigned_by)
select distinct on (profile_id, charging_station_id) profile_id, charging_station_id, assigned_by
from public.employee_station_assignments
order by profile_id, charging_station_id, created_at desc
on conflict (profile_id, charging_station_id) do nothing;

create index if not exists employee_station_base_assignments_profile_idx
  on public.employee_station_base_assignments(profile_id, charging_station_id)
  where is_active;

alter table public.employee_station_base_assignments enable row level security;
drop policy if exists "staff read base station assignments" on public.employee_station_base_assignments;
create policy "staff read base station assignments"
  on public.employee_station_base_assignments for select to authenticated
  using (profile_id = auth.uid() or public.is_dispatch_manager());

create table if not exists public.system_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null check (length(trim(message)) between 1 and 1000),
  visible_from timestamptz not null default now(),
  visible_until timestamptz,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visible_until is null or visible_until > visible_from)
);
create index if not exists system_announcements_visible_idx
  on public.system_announcements(is_active, visible_from, visible_until);
alter table public.system_announcements enable row level security;
drop policy if exists "staff read live announcements" on public.system_announcements;
create policy "staff read live announcements" on public.system_announcements for select to authenticated
  using (is_active and visible_from <= now() and (visible_until is null or visible_until > now()));

create or replace function public.can_access_station(station_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_dispatch_manager()
    or exists (
      select 1 from public.employee_station_base_assignments esa
      where esa.profile_id = auth.uid()
        and esa.charging_station_id = station_id
        and esa.is_active
    )
$$;
