-- Each operating date has its own night shift.  Starting a newer service date
-- closes only older plans; completed work and all evidence remain immutable.
create or replace function public.expire_prior_dispatch_tasks(p_new_plan_id uuid, p_actor_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare changed_count integer := 0; new_service_date date;
begin
  select service_date into new_service_date from public.daily_plans where id = p_new_plan_id;
  if new_service_date is null then raise exception 'DAILY_PLAN_NOT_FOUND'; end if;

  with candidates as (
    select task.id, task.status
    from public.dispatch_tasks task
    join public.daily_plans plan on plan.id = task.daily_plan_id
    where task.task_type = 'di_chuyen'
      and plan.service_date < new_service_date
      and task.status not in ('hoan_thanh', 'qua_han')
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
         'Hệ thống kết thúc ca cũ khi bắt đầu ngày vận doanh mới.',
         jsonb_build_object('system', true, 'new_service_date', new_service_date)
  from changed;
  get diagnostics changed_count = row_count;

  update public.daily_plans
     set status = 'superseded'
   where service_date < new_service_date
     and status in ('draft', 'locked');
  return changed_count;
end $$;

-- Station access is intentionally strict: admin sees all stations; drivers and
-- dispatchers need an active base assignment.  This fixes legacy functions
-- that were still consulting daily-only assignments.
create or replace function public.can_access_station(station_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() = 'admin'
    or exists (
      select 1 from public.employee_station_base_assignments assignment
      where assignment.profile_id = auth.uid()
        and assignment.charging_station_id = station_id
        and assignment.is_active
    )
$$;

create or replace function public.claim_dispatch_task(p_task_id uuid)
returns public.dispatch_tasks language plpgsql security definer set search_path = public as $$
declare task public.dispatch_tasks; claimed public.dispatch_tasks;
begin
  if public.current_role() not in ('lai_xe', 'admin') then
    raise exception 'TASK_CLAIM_FORBIDDEN';
  end if;
  select * into task from public.dispatch_tasks where id = p_task_id for update;
  if task.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  if task.status not in ('chua_sac', 'moi') then raise exception 'TASK_NOT_AVAILABLE'; end if;
  if task.assigned_profile_id is not null and task.assigned_profile_id <> auth.uid() then raise exception 'TASK_ALREADY_CLAIMED'; end if;
  if public.current_role() <> 'admin' and not public.can_access_station(task.to_station_id) then
    raise exception 'TASK_STATION_NOT_ASSIGNED';
  end if;
  update public.dispatch_tasks
     set assigned_profile_id=auth.uid(), assigned_by=auth.uid(), updated_at=now()
   where id=task.id returning * into claimed;
  return claimed;
end $$;

-- Re-run the safe archival cleanup for records created before the unique index.
select * from public.cleanup_duplicate_dispatch_tasks();

-- Schedules without a task are remnants of interrupted old imports. They carry
-- no history and cannot be operated, so removing them only repairs the roster.
delete from public.daily_vehicle_schedules schedule
where not exists (select 1 from public.dispatch_tasks task where task.daily_vehicle_schedule_id = schedule.id);
