import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

export async function GET() {
  let actor;
  try { actor = await getCurrentUserContext(); } catch (caught) {
    if (caught instanceof UnauthenticatedError) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Bạn cần đăng nhập.' } }, { status: 401 });
    throw caught;
  }
  const db = createServiceRoleClient();
  const { data: plan, error: planError } = await db.from('daily_plans').select('id,service_date').order('service_date', { ascending: false }).limit(1).maybeSingle();
  if (planError) return NextResponse.json({ error: { code: 'PLAN_QUERY_FAILED', message: planError.message } }, { status: 500 });
  if (!plan) return NextResponse.json({ tasks: [], plan: null, scope: { mode: 'all', stationIds: [] } });
  const { data: tasks, error } = await db.from('dispatch_tasks')
    .select('*, assigned_profile:profiles!dispatch_tasks_assigned_profile_id_fkey(full_name,employee_code), vehicles(license_plate), daily_vehicle_schedules(roster_sequence,earliest_departure_at, plan_route_ends(route_code,route_end_name))')
    .eq('daily_plan_id', plan.id)
    .neq('status', 'qua_han')
    .order('priority_lct_at', { ascending: true, nullsFirst: false });
  if (error) return NextResponse.json({ error: { code: 'QUERY_FAILED', message: error.message } }, { status: 500 });
  if (!['lai_xe', 'dieu_phoi'].includes(actor.role)) return NextResponse.json({ tasks: tasks ?? [], plan, scope: { mode: 'all', stationIds: [] } });
  const { data: assignments } = await db.from('employee_station_base_assignments').select('charging_station_id').eq('profile_id', actor.userId).eq('is_active', true);
  const permitted = new Set((assignments ?? []).map((row: { charging_station_id: string }) => row.charging_station_id));
  const visible = (tasks ?? []).filter((task: { to_station_id: string | null; assigned_profile_id: string | null }) => Boolean((task.to_station_id && permitted.has(task.to_station_id)) || task.assigned_profile_id === actor.userId));
  return NextResponse.json({
    tasks: visible,
    plan,
    scope: { mode: 'station', stationIds: [...permitted] },
    notice: permitted.size ? null : 'Bạn chưa được phân công trạm nào. Liên hệ admin để được cấp trạm làm việc.',
  });
}
