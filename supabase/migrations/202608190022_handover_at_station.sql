-- A vehicle may be delivered to a station by driver A and returned to the depot by driver B.
-- The handover is only possible at the task's assigned station and is retained in task_events.
create or replace function public.transition_dispatch_task(
  p_task_id uuid, p_next_status public.dispatch_task_status, p_latitude numeric, p_longitude numeric,
  p_accuracy_m numeric default null, p_note text default null
) returns public.task_events language plpgsql security definer set search_path = public as $$
declare task public.dispatch_tasks; allowed boolean := false; created_event public.task_events; taking_return boolean := false; other_active_task uuid;
begin
  if p_latitude is null or p_longitude is null then raise exception 'GPS_REQUIRED'; end if;
  select * into task from public.dispatch_tasks where id = p_task_id for update;
  if task.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  taking_return := task.task_type = 'di_chuyen' and task.status = 'giao_tram_sac' and p_next_status = 'nhan_tram_sac'
    and public.current_role() = 'lai_xe' and public.can_access_station(task.to_station_id);
  if not taking_return and task.assigned_profile_id is distinct from auth.uid() and not public.is_dispatch_manager() then
    raise exception 'TASK_ACTION_FORBIDDEN';
  end if;
  if taking_return then
    select id into other_active_task from public.dispatch_tasks
      where assigned_profile_id = auth.uid() and task_type = 'di_chuyen' and id <> task.id
        and status in ('nhan_xe_dau_ben', 'nhan_tram_sac')
      limit 1 for update;
    if other_active_task is not null then raise exception 'EMPLOYEE_ACTIVE_TASK'; end if;
  end if;
  if task.task_type = 'di_chuyen' then
    allowed := (task.status, p_next_status) in (
      ('chua_sac','nhan_xe_dau_ben'), ('nhan_xe_dau_ben','giao_tram_sac'),
      ('giao_tram_sac','nhan_tram_sac'), ('nhan_tram_sac','giao_dau_ben'), ('giao_dau_ben','hoan_thanh')
    );
  else
    allowed := (task.status, p_next_status) in (('moi','dang_xu_ly'),('dang_xu_ly','hoan_thanh'));
  end if;
  if not allowed then raise exception 'TASK_INVALID_TRANSITION'; end if;
  update public.dispatch_tasks
    set status = p_next_status,
        assigned_profile_id = case when taking_return then auth.uid() else assigned_profile_id end,
        assigned_by = case when taking_return then auth.uid() else assigned_by end,
        completed_at = case when p_next_status='hoan_thanh' then now() else null end,
        updated_at = now()
    where id = task.id;
  insert into public.task_events(task_id,event_type,from_status,to_status,actor_profile_id,latitude,longitude,gps_accuracy_m,note)
    values(task.id,'transition',task.status,p_next_status,auth.uid(),p_latitude,p_longitude,p_accuracy_m,p_note)
    returning * into created_event;
  return created_event;
end $$;
