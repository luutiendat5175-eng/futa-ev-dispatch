-- Excel baseline/import release: coordinators may correct only tasks at stations
-- to which they are permanently assigned.  Evidence and the full event history
-- are deliberately retained by rollback_dispatch_task.
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
  if public.current_role() not in ('admin', 'dieu_phoi') then
    raise exception 'TASK_ROLLBACK_FORBIDDEN';
  end if;
  select * into task from public.dispatch_tasks where id = p_task_id for update;
  if task.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  if public.current_role() = 'dieu_phoi' and not public.can_access_station(task.to_station_id) then
    raise exception 'TASK_ROLLBACK_STATION_FORBIDDEN';
  end if;
  target_is_valid := case when task.task_type = 'di_chuyen'
    then p_target_status in ('chua_sac','nhan_xe_dau_ben','giao_tram_sac','doi_sac','nhan_tram_sac','giao_dau_ben','hoan_thanh')
    else p_target_status in ('moi','dang_xu_ly','hoan_thanh') end;
  if not target_is_valid then raise exception 'TASK_INVALID_TARGET_STATUS'; end if;

  update public.dispatch_tasks set status = p_target_status,
    completed_at = case when p_target_status = 'hoan_thanh' then now() else null end,
    updated_at = now() where id = task.id;
  insert into public.task_events (task_id, event_type, from_status, to_status, actor_profile_id, note, metadata)
  values (task.id, 'rollback', task.status, p_target_status, auth.uid(), p_note,
    jsonb_build_object('reason', 'manager_manual_rollback', 'actor_role', public.current_role()))
  returning * into created_event;
  insert into public.audit_logs (actor_profile_id, entity_type, entity_id, action, before_data, after_data)
  values (auth.uid(), 'dispatch_task', task.id, 'rollback',
    jsonb_build_object('status', task.status), jsonb_build_object('status', p_target_status, 'task_event_id', created_event.id));
  return created_event;
end $$;
