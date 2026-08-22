-- Make priority-window warnings follow the task's configured priority range.
-- The previous implementation searched for a window active at the current
-- time first, so a claim made outside every configured window returned early
-- and could never be reported.
create or replace function public.record_priority_violation_for_claim(
  p_task_id uuid,
  p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row record;
  rule_row record;
  v_current_time time;
  task_priority integer;
  is_inside_window boolean;
  v_id uuid;
begin
  select task.id, task.daily_plan_id, task.to_station_id, task.vehicle_id
  into task_row
  from public.dispatch_tasks task
  where task.id = p_task_id;

  if task_row.id is null then return null; end if;

  select ranked.rank
  into task_priority
  from (
    select id, row_number() over(order by priority_lct_at asc nulls last, id) as rank
    from public.dispatch_tasks
    where daily_plan_id = task_row.daily_plan_id
      and to_station_id = task_row.to_station_id
      and task_type = 'di_chuyen'
  ) ranked
  where ranked.id = task_row.id;

  select priority_window.*
  into rule_row
  from public.station_priority_windows priority_window
  where priority_window.charging_station_id = task_row.to_station_id
    and priority_window.is_active
    and task_priority between priority_window.priority_min and priority_window.priority_max
  order by priority_window.priority_min asc, priority_window.priority_max asc
  limit 1;

  -- A station may intentionally leave some priorities unrestricted.
  if rule_row.id is null then return null; end if;

  v_current_time := (now() at time zone 'Asia/Ho_Chi_Minh')::time;
  is_inside_window :=
    (rule_row.starts_at <= rule_row.ends_at
      and v_current_time >= rule_row.starts_at
      and v_current_time < rule_row.ends_at)
    or
    (rule_row.starts_at > rule_row.ends_at
      and (v_current_time >= rule_row.starts_at or v_current_time < rule_row.ends_at));

  if not is_inside_window then
    v_id := public.open_violation_case(
      'priority:' || task_row.id || ':' ||
        (now() at time zone 'Asia/Ho_Chi_Minh')::date || ':' || rule_row.id,
      'priority_window',
      task_row.id,
      null,
      task_row.daily_plan_id,
      task_row.to_station_id,
      p_actor_id,
      task_row.vehicle_id,
      format(
        'Nhận xe ưu tiên %s ngoài khung giờ %s–%s.',
        task_priority,
        to_char(rule_row.starts_at, 'HH24:MI'),
        to_char(rule_row.ends_at, 'HH24:MI')
      ),
      jsonb_build_object(
        'priority', task_priority,
        'priority_min', rule_row.priority_min,
        'priority_max', rule_row.priority_max,
        'window_start', rule_row.starts_at,
        'window_end', rule_row.ends_at,
        'claimed_at', now()
      )
    );
  end if;

  return v_id;
end
$$;
