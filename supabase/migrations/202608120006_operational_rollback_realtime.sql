-- Operational controls: unrestricted admin rollback with audit trail and Realtime task updates.
alter table public.task_events alter column latitude drop not null;
alter table public.task_events alter column longitude drop not null;

create or replace function public.rollback_dispatch_task(
  p_task_id uuid,
  p_target_status public.dispatch_task_status,
  p_note text default null
) returns public.task_events
language plpgsql security definer set search_path = public
as $$
declare
  task public.dispatch_tasks;
  created_event public.task_events;
  target_is_valid boolean;
begin
  if not public.is_admin() then raise exception 'TASK_ROLLBACK_FORBIDDEN'; end if;
  select * into task from public.dispatch_tasks where id = p_task_id for update;
  if task.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  target_is_valid := case when task.task_type = 'di_chuyen'
    then p_target_status in ('chua_sac','nhan_xe_dau_ben','giao_tram_sac','doi_sac','nhan_tram_sac','giao_dau_ben','hoan_thanh')
    else p_target_status in ('moi','dang_xu_ly','hoan_thanh') end;
  if not target_is_valid then raise exception 'TASK_INVALID_TARGET_STATUS'; end if;

  update public.dispatch_tasks set status = p_target_status,
    completed_at = case when p_target_status = 'hoan_thanh' then now() else null end,
    updated_at = now() where id = task.id;

  insert into public.task_events (task_id, event_type, from_status, to_status, actor_profile_id, note, metadata)
  values (task.id, 'rollback', task.status, p_target_status, auth.uid(), p_note,
    jsonb_build_object('reason', 'admin_manual_rollback')) returning * into created_event;

  insert into public.audit_logs (actor_profile_id, entity_type, entity_id, action, before_data, after_data)
  values (auth.uid(), 'dispatch_task', task.id, 'rollback',
    jsonb_build_object('status', task.status), jsonb_build_object('status', p_target_status, 'task_event_id', created_event.id));
  return created_event;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'dispatch_tasks'
  ) then
    alter publication supabase_realtime add table public.dispatch_tasks;
  end if;
end $$;
