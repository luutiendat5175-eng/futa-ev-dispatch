-- Dispatch-only operational flow: skip the charging-wait state in the driver workflow.
create or replace function public.transition_dispatch_task(
  p_task_id uuid, p_next_status public.dispatch_task_status, p_latitude numeric, p_longitude numeric,
  p_accuracy_m numeric default null, p_note text default null
) returns public.task_events language plpgsql security definer set search_path = public as $$
declare task public.dispatch_tasks; allowed boolean := false; created_event public.task_events;
begin
  if p_latitude is null or p_longitude is null then raise exception 'GPS_REQUIRED'; end if;
  select * into task from public.dispatch_tasks where id = p_task_id for update;
  if task.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  if task.assigned_profile_id is distinct from auth.uid() and not public.is_dispatch_manager() then raise exception 'TASK_ACTION_FORBIDDEN'; end if;
  if task.task_type = 'di_chuyen' then
    allowed := (task.status, p_next_status) in (('chua_sac','nhan_xe_dau_ben'),('nhan_xe_dau_ben','giao_tram_sac'),('giao_tram_sac','nhan_tram_sac'),('nhan_tram_sac','giao_dau_ben'),('giao_dau_ben','hoan_thanh'));
  else allowed := (task.status, p_next_status) in (('moi','dang_xu_ly'),('dang_xu_ly','hoan_thanh')); end if;
  if not allowed then raise exception 'TASK_INVALID_TRANSITION'; end if;
  update public.dispatch_tasks set status=p_next_status, completed_at=case when p_next_status='hoan_thanh' then now() else null end, updated_at=now() where id=task.id;
  insert into public.task_events (task_id,event_type,from_status,to_status,actor_profile_id,latitude,longitude,gps_accuracy_m,note) values (task.id,'transition',task.status,p_next_status,auth.uid(),p_latitude,p_longitude,p_accuracy_m,p_note) returning * into created_event;
  return created_event;
end $$;
