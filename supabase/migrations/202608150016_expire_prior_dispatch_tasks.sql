-- Run after 202608150015. Kept separate because PostgreSQL requires the
-- newly-added enum value to be committed before it can be used in a function.
create or replace function public.expire_prior_dispatch_tasks(p_new_plan_id uuid, p_actor_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare changed_count integer;
begin
  with candidates as (
    select id, status from public.dispatch_tasks
     where task_type = 'di_chuyen'
       and daily_plan_id <> p_new_plan_id
       and status not in ('hoan_thanh', 'qua_han')
     for update
  ), changed as (
    update public.dispatch_tasks task
       set status = 'qua_han', updated_at = now()
      from candidates candidate
     where task.id = candidate.id
     returning task.id, candidate.status as prior_status
  )
  insert into public.task_events(task_id,event_type,from_status,to_status,actor_profile_id,latitude,longitude,note,metadata)
  select id, 'system_expire', prior_status, 'qua_han', p_actor_id, 0, 0,
         'Hệ thống chuyển quá hạn khi tạo bảng tài ngày vận doanh mới.', jsonb_build_object('system', true)
  from changed;
  get diagnostics changed_count = row_count;
  return changed_count;
end $$;
