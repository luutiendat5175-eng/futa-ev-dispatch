-- Repair for v25 migration run interrupted by PostgreSQL keyword CURRENT_TIME.
-- Safe to run after a partial v25 execution, then rerun 202608180021 in full.
create or replace function public.record_priority_violation_for_claim(p_task_id uuid, p_actor_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare task_row record; rule_row record; v_current_time time; task_priority integer; v_id uuid;
begin
  select task.id,task.daily_plan_id,task.to_station_id,task.vehicle_id,task.priority_lct_at
  into task_row from public.dispatch_tasks task where task.id=p_task_id;
  if task_row.id is null then return null; end if;
  v_current_time := (now() at time zone 'Asia/Ho_Chi_Minh')::time;
  select priority_window.* into rule_row from public.station_priority_windows priority_window
   where priority_window.charging_station_id=task_row.to_station_id and priority_window.is_active
     and ((priority_window.starts_at <= priority_window.ends_at and v_current_time >= priority_window.starts_at and v_current_time < priority_window.ends_at)
       or (priority_window.starts_at > priority_window.ends_at and (v_current_time >= priority_window.starts_at or v_current_time < priority_window.ends_at)))
   order by priority_window.starts_at desc limit 1;
  if rule_row.id is null then return null; end if;
  select ranked.rank into task_priority from (
    select id,row_number() over(order by priority_lct_at asc nulls last,id) as rank
    from public.dispatch_tasks where daily_plan_id=task_row.daily_plan_id and to_station_id=task_row.to_station_id and task_type='di_chuyen'
  ) ranked where ranked.id=task_row.id;
  if task_priority < rule_row.priority_min or task_priority > rule_row.priority_max then
    v_id := public.open_violation_case(
      'priority:' || task_row.id || ':' || (now() at time zone 'Asia/Ho_Chi_Minh')::date || ':' || rule_row.id,
      'priority_window',task_row.id,null,task_row.daily_plan_id,task_row.to_station_id,p_actor_id,task_row.vehicle_id,
      format('Nhận xe ưu tiên %s ngoài khung cho phép ưu tiên %s–%s.',task_priority,rule_row.priority_min,rule_row.priority_max),
      jsonb_build_object('priority',task_priority,'priority_min',rule_row.priority_min,'priority_max',rule_row.priority_max,'window_start',rule_row.starts_at,'window_end',rule_row.ends_at)
    );
  end if;
  return v_id;
end $$;
