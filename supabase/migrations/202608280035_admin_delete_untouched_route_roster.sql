create or replace function public.admin_delete_untouched_route_roster(p_service_date date,p_route_code text,p_actor_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare plan_id uuid;deleted_count integer;
begin
  if not exists(select 1 from public.profiles where id=p_actor_id and role='admin' and is_active) then raise exception 'ADMIN_REQUIRED';end if;
  select id into plan_id from public.daily_plans where service_date=p_service_date;
  if plan_id is null then raise exception 'PLAN_NOT_FOUND';end if;
  if exists(select 1 from public.dispatch_tasks t join public.daily_vehicle_schedules s on s.id=t.daily_vehicle_schedule_id join public.plan_route_ends e on e.id=s.plan_route_end_id where t.daily_plan_id=plan_id and e.route_code=p_route_code and(t.assigned_profile_id is not null or exists(select 1 from public.task_events v where v.task_id=t.id)))then raise exception 'ROUTE_HAS_OPERATION_HISTORY';end if;
  delete from public.dispatch_tasks t using public.daily_vehicle_schedules s,public.plan_route_ends e where t.daily_vehicle_schedule_id=s.id and s.plan_route_end_id=e.id and t.daily_plan_id=plan_id and e.route_code=p_route_code;get diagnostics deleted_count=row_count;
  delete from public.daily_vehicle_schedules s using public.plan_route_ends e where s.plan_route_end_id=e.id and s.daily_plan_id=plan_id and e.route_code=p_route_code and not exists(select 1 from public.dispatch_tasks t where t.daily_vehicle_schedule_id=s.id);
  insert into public.audit_logs(actor_profile_id,action,entity_type,entity_id,after_data)values(p_actor_id,'delete_untouched_route_roster','daily_plan',plan_id,jsonb_build_object('route_code',p_route_code,'deleted_tasks',deleted_count));return deleted_count;
end $$;
revoke all on function public.admin_delete_untouched_route_roster(date,text,uuid)from public;grant execute on function public.admin_delete_untouched_route_roster(date,text,uuid)to service_role;
