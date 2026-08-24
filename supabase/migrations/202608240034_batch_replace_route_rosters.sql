create or replace function public.replace_route_rosters_batch(
  p_daily_plan_id uuid,
  p_routes jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare item jsonb; generated integer; results jsonb:='[]'::jsonb;
begin
  if public.current_role() not in ('admin','dieu_do') then raise exception 'IMPORT_FORBIDDEN'; end if;
  if jsonb_typeof(p_routes)<>'array' or jsonb_array_length(p_routes)=0 then raise exception 'EMPTY_BATCH'; end if;
  for item in select value from jsonb_array_elements(p_routes)
  loop
    generated:=public.replace_route_roster(p_daily_plan_id,item->>'routeCode',item->'schedules');
    results:=results||jsonb_build_array(jsonb_build_object('routeCode',item->>'routeCode','tasksGenerated',generated));
  end loop;
  return results;
end $$;
grant execute on function public.replace_route_rosters_batch(uuid,jsonb) to authenticated;
