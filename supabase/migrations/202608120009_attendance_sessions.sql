create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  daily_plan_id uuid references public.daily_plans(id) on delete set null,
  checked_in_at timestamptz not null default now(),
  check_in_latitude numeric,
  check_in_longitude numeric,
  checked_out_at timestamptz,
  check_out_latitude numeric,
  check_out_longitude numeric,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists work_sessions_one_open_per_profile on public.work_sessions(profile_id) where checked_out_at is null;
create table if not exists public.work_session_photos (
  id uuid primary key default gen_random_uuid(),
  work_session_id uuid not null references public.work_sessions(id) on delete cascade,
  action text not null check (action in ('in','out')),
  storage_path text not null unique,
  mime_type text not null,
  bytes integer not null,
  captured_at timestamptz not null default now(),
  latitude numeric,
  longitude numeric
);
alter table public.work_sessions enable row level security;
alter table public.work_session_photos enable row level security;
drop policy if exists "staff read work sessions" on public.work_sessions;
create policy "staff read work sessions" on public.work_sessions for select to authenticated using (profile_id=auth.uid() or public.is_dispatch_manager());
drop policy if exists "staff read attendance photos" on public.work_session_photos;
create policy "staff read attendance photos" on public.work_session_photos for select to authenticated using (exists (select 1 from public.work_sessions s where s.id=work_session_id and (s.profile_id=auth.uid() or public.is_dispatch_manager())));
alter table public.work_sessions replica identity full;

insert into storage.buckets (id,name,public) values ('attendance-proof','attendance-proof',false) on conflict (id) do nothing;
drop policy if exists "authenticated upload attendance proof" on storage.objects;
create policy "authenticated upload attendance proof" on storage.objects for insert to authenticated with check (bucket_id='attendance-proof' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "staff read attendance proof" on storage.objects;
create policy "staff read attendance proof" on storage.objects for select to authenticated using (bucket_id='attendance-proof');
