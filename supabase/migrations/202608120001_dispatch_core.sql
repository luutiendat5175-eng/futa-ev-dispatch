-- EV Dispatch core: daily plans, LCT-prioritised tasks, immutable audit and GPS photo proof.
-- Apply in Supabase SQL Editor or with Supabase CLI before deploying the web app.

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('admin', 'dieu_phoi', 'dieu_do', 'lai_xe');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.daily_plan_status as enum ('draft', 'locked', 'superseded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispatch_task_type as enum (
    'di_chuyen', 'ho_tro', 'kiem_tra', 've_sinh', 'dieu_dong', 'phat_sinh'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispatch_task_status as enum (
    'chua_sac', 'nhan_xe_dau_ben', 'giao_tram_sac', 'doi_sac',
    'nhan_tram_sac', 'giao_dau_ben', 'hoan_thanh',
    'moi', 'dang_xu_ly'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_code text not null unique check (employee_code = upper(trim(employee_code))),
  full_name text not null,
  role public.app_role not null default 'lai_xe',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.depots (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  x numeric(10,7) not null,
  y numeric(10,7) not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.charging_stations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  x numeric(10,7) not null,
  y numeric(10,7) not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Thời gian sạc là cấu hình theo loại xe, không nằm trong PA đậu đêm.
-- Quản lý có thể cập nhật giá trị này khi điều kiện vận hành thay đổi.
create table if not exists public.vehicle_types (
  code text primary key,
  charge_minutes integer not null check (charge_minutes >= 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  license_plate text not null unique,
  vehicle_type_code text references public.vehicle_types(code),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  service_date date not null unique,
  shift_started_at timestamptz not null,
  shift_ends_at timestamptz not null,
  status public.daily_plan_status not null default 'draft',
  version integer not null default 1 check (version > 0),
  source_name text,
  imported_by uuid references public.profiles(id),
  locked_by uuid references public.profiles(id),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (shift_ends_at > shift_started_at)
);

-- A snapshot is retained on every re-import; operational records always point to a stable version.
create table if not exists public.daily_plan_versions (
  id uuid primary key default gen_random_uuid(),
  daily_plan_id uuid not null references public.daily_plans(id) on delete cascade,
  version integer not null,
  imported_by uuid references public.profiles(id),
  imported_at timestamptz not null default now(),
  source_name text,
  payload jsonb not null,
  unique (daily_plan_id, version)
);

-- One record for each route end in the manager-entered PA đậu đêm.
create table if not exists public.plan_route_ends (
  id uuid primary key default gen_random_uuid(),
  daily_plan_id uuid not null references public.daily_plans(id) on delete cascade,
  route_code text not null,
  route_name text not null,
  route_end_name text not null,
  -- Bãi đậu đêm thay đổi (depot), không phải tên đầu bến tuyến.
  overnight_depot_id uuid references public.depots(id),
  charging_station_id uuid not null references public.charging_stations(id),
  planned_vehicle_count integer not null default 0 check (planned_vehicle_count >= 0),
  -- Thời gian huy động là số liệu cuối cùng để tính LCT.
  mobilization_minutes integer not null check (mobilization_minutes >= 0),
  buffer_minutes integer not null default 10 check (buffer_minutes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  unique (daily_plan_id, route_code, route_end_name)
);

-- Per vehicle, the earliest departure at the matching end of route from the daily duty roster.
create table if not exists public.daily_vehicle_schedules (
  id uuid primary key default gen_random_uuid(),
  daily_plan_id uuid not null references public.daily_plans(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id),
  plan_route_end_id uuid not null references public.plan_route_ends(id),
  earliest_departure_at timestamptz not null,
  lct_at timestamptz not null,
  source_trip_count integer not null default 1 check (source_trip_count > 0),
  metadata jsonb not null default '{}'::jsonb,
  unique (daily_plan_id, vehicle_id, plan_route_end_id)
);

create table if not exists public.employee_station_assignments (
  id uuid primary key default gen_random_uuid(),
  daily_plan_id uuid not null references public.daily_plans(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  charging_station_id uuid not null references public.charging_stations(id),
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (daily_plan_id, profile_id, charging_station_id)
);

create table if not exists public.dispatch_tasks (
  id uuid primary key default gen_random_uuid(),
  daily_plan_id uuid not null references public.daily_plans(id) on delete restrict,
  daily_vehicle_schedule_id uuid references public.daily_vehicle_schedules(id),
  task_type public.dispatch_task_type not null default 'di_chuyen',
  status public.dispatch_task_status not null default 'chua_sac',
  priority_lct_at timestamptz,
  vehicle_id uuid references public.vehicles(id),
  from_depot_id uuid references public.depots(id),
  to_station_id uuid references public.charging_stations(id),
  assigned_profile_id uuid references public.profiles(id),
  assigned_by uuid references public.profiles(id),
  eta_at timestamptz,
  title text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (
    (task_type = 'di_chuyen' and vehicle_id is not null and to_station_id is not null)
    or task_type <> 'di_chuyen'
  )
);

create index if not exists dispatch_tasks_priority_idx
  on public.dispatch_tasks (daily_plan_id, status, priority_lct_at asc nulls last);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.dispatch_tasks(id) on delete restrict,
  event_type text not null,
  from_status public.dispatch_task_status,
  to_status public.dispatch_task_status,
  actor_profile_id uuid not null references public.profiles(id),
  occurred_at timestamptz not null default now(),
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  gps_accuracy_m numeric(8,2),
  note text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.task_event_photos (
  id uuid primary key default gen_random_uuid(),
  task_event_id uuid not null references public.task_events(id) on delete restrict,
  storage_path text not null unique,
  thumbnail_path text,
  mime_type text not null,
  bytes integer not null check (bytes > 0),
  captured_at timestamptz not null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);

create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_role() = 'admin' $$;

create or replace function public.is_dispatch_manager()
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_role() in ('admin', 'dieu_phoi') $$;

create or replace function public.can_access_station(station_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_dispatch_manager()
    or exists (
      select 1 from public.employee_station_assignments esa
      join public.daily_plans dp on dp.id = esa.daily_plan_id
      where esa.profile_id = auth.uid()
        and esa.charging_station_id = station_id
        and dp.service_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date
    )
$$;

create or replace function public.claim_dispatch_task(p_task_id uuid)
returns public.dispatch_tasks
language plpgsql security definer set search_path = public
as $$
declare claimed public.dispatch_tasks;
begin
  if public.current_role() not in ('lai_xe', 'admin') then
    raise exception 'TASK_CLAIM_FORBIDDEN';
  end if;

  update public.dispatch_tasks t
     set assigned_profile_id = auth.uid(), assigned_by = auth.uid(), updated_at = now()
   where t.id = p_task_id
     and t.assigned_profile_id is null
     and t.status in ('chua_sac', 'moi')
     and public.can_access_station(t.to_station_id)
   returning t.* into claimed;

  if claimed.id is null then
    raise exception 'TASK_NOT_AVAILABLE';
  end if;
  return claimed;
end $$;

create or replace function public.transition_dispatch_task(
  p_task_id uuid,
  p_next_status public.dispatch_task_status,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_m numeric default null,
  p_note text default null
) returns public.task_events
language plpgsql security definer set search_path = public
as $$
declare
  task public.dispatch_tasks;
  is_rollback boolean;
  allowed boolean := false;
  created_event public.task_events;
begin
  if p_latitude is null or p_longitude is null then
    raise exception 'GPS_REQUIRED';
  end if;

  select * into task from public.dispatch_tasks where id = p_task_id for update;
  if task.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  if task.assigned_profile_id is distinct from auth.uid() and not public.is_dispatch_manager() then
    raise exception 'TASK_ACTION_FORBIDDEN';
  end if;

  if task.task_type = 'di_chuyen' then
    allowed := (task.status, p_next_status) in (
      ('chua_sac', 'nhan_xe_dau_ben'),
      ('nhan_xe_dau_ben', 'giao_tram_sac'),
      ('giao_tram_sac', 'doi_sac'),
      ('doi_sac', 'nhan_tram_sac'),
      ('nhan_tram_sac', 'giao_dau_ben'),
      ('giao_dau_ben', 'hoan_thanh')
    );
  else
    allowed := (task.status, p_next_status) in (
      ('moi', 'dang_xu_ly'), ('dang_xu_ly', 'hoan_thanh')
    );
  end if;

  is_rollback := (task.task_type = 'di_chuyen' and (
    (task.status, p_next_status) in (
      ('nhan_xe_dau_ben','chua_sac'), ('giao_tram_sac','nhan_xe_dau_ben'),
      ('doi_sac','giao_tram_sac'), ('nhan_tram_sac','doi_sac'),
      ('giao_dau_ben','nhan_tram_sac'), ('hoan_thanh','giao_dau_ben')
    ))) or (task.task_type <> 'di_chuyen' and (task.status, p_next_status) in (
      ('dang_xu_ly','moi'), ('hoan_thanh','dang_xu_ly')
    ));
  if is_rollback and not public.is_dispatch_manager() then
    raise exception 'TASK_ROLLBACK_FORBIDDEN';
  end if;
  if not allowed and not is_rollback then raise exception 'TASK_INVALID_TRANSITION'; end if;

  update public.dispatch_tasks
     set status = p_next_status,
         completed_at = case when p_next_status = 'hoan_thanh' then now() else null end,
         updated_at = now()
   where id = task.id;

  insert into public.task_events (
    task_id, event_type, from_status, to_status, actor_profile_id, latitude, longitude, gps_accuracy_m, note
  ) values (
    task.id, case when is_rollback then 'rollback' else 'transition' end, task.status, p_next_status,
    auth.uid(), p_latitude, p_longitude, p_accuracy_m, p_note
  ) returning * into created_event;
  return created_event;
end $$;

-- Automatic task generation. Rebuild only while the daily plan is a draft.
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

alter table public.profiles enable row level security;
alter table public.vehicle_types enable row level security;
alter table public.daily_plans enable row level security;
alter table public.plan_route_ends enable row level security;
alter table public.daily_vehicle_schedules enable row level security;
alter table public.dispatch_tasks enable row level security;
alter table public.task_events enable row level security;
alter table public.task_event_photos enable row level security;
alter table public.employee_station_assignments enable row level security;

-- SQL Editor does not wrap a long script in a transaction. If it stops after
-- creating some policies, a safe re-run must replace those policies.
drop policy if exists "profiles visible to signed in" on public.profiles;
drop policy if exists "admins manage profiles" on public.profiles;
drop policy if exists "staff read vehicle types" on public.vehicle_types;
drop policy if exists "admins manage vehicle types" on public.vehicle_types;
drop policy if exists "staff read plans" on public.daily_plans;
drop policy if exists "admins manage plans" on public.daily_plans;
drop policy if exists "staff read route plans" on public.plan_route_ends;
drop policy if exists "staff read vehicle schedules" on public.daily_vehicle_schedules;
drop policy if exists "staff read permitted tasks" on public.dispatch_tasks;
drop policy if exists "staff read own events" on public.task_events;
drop policy if exists "staff read assignments" on public.employee_station_assignments;

create policy "profiles visible to signed in" on public.profiles for select to authenticated using (true);
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "staff read vehicle types" on public.vehicle_types for select to authenticated using (true);
create policy "admins manage vehicle types" on public.vehicle_types for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "staff read plans" on public.daily_plans for select to authenticated using (true);
create policy "admins manage plans" on public.daily_plans for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "staff read route plans" on public.plan_route_ends for select to authenticated using (true);
create policy "staff read vehicle schedules" on public.daily_vehicle_schedules for select to authenticated using (true);
create policy "staff read permitted tasks" on public.dispatch_tasks for select to authenticated using (
  public.is_dispatch_manager() or public.can_access_station(to_station_id) or assigned_profile_id = auth.uid()
);
create policy "staff read own events" on public.task_events for select to authenticated using (
  actor_profile_id = auth.uid() or exists (
    select 1 from public.dispatch_tasks t where t.id = task_id and (
      public.is_dispatch_manager() or t.assigned_profile_id = auth.uid() or public.can_access_station(t.to_station_id)
    )
  )
);
create policy "staff read assignments" on public.employee_station_assignments for select to authenticated using (
  profile_id = auth.uid() or public.is_dispatch_manager()
);

insert into storage.buckets (id, name, public)
values ('task-proof', 'task-proof', false)
on conflict (id) do nothing;

drop policy if exists "authenticated upload task proof" on storage.objects;
drop policy if exists "staff read permitted task proof" on storage.objects;

create policy "authenticated upload task proof" on storage.objects for insert to authenticated
with check (
  bucket_id = 'task-proof'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "staff read permitted task proof" on storage.objects for select to authenticated
using (bucket_id = 'task-proof');
