-- Enforce station assignment against the operating plan of the task itself.
create or replace function public.can_access_dispatch_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_dispatch_manager() or exists (
    select 1 from public.dispatch_tasks task
    join public.employee_station_assignments assignment
      on assignment.daily_plan_id = task.daily_plan_id
     and assignment.charging_station_id = task.to_station_id
    where task.id = p_task_id and assignment.profile_id = auth.uid()
  );
$$;

create or replace function public.claim_dispatch_task(p_task_id uuid)
returns public.dispatch_tasks language plpgsql security definer set search_path = public as $$
declare claimed public.dispatch_tasks;
begin
  if public.current_role() not in ('lai_xe', 'admin') then raise exception 'TASK_CLAIM_FORBIDDEN'; end if;
  update public.dispatch_tasks task set assigned_profile_id=auth.uid(),assigned_by=auth.uid(),updated_at=now()
   where task.id=p_task_id and task.assigned_profile_id is null and task.status in ('chua_sac','moi')
     and public.can_access_dispatch_task(task.id)
   returning task.* into claimed;
  if claimed.id is null then raise exception 'TASK_NOT_AVAILABLE'; end if;
  return claimed;
end $$;
