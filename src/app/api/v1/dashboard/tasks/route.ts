import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

const TASK_SELECT = 'id,task_type,status,eta_at,priority_lct_at,vehicle_id,assigned_profile_id,from_depot_id,to_station_id,vehicles(license_plate,vehicle_type_code),depots(name,x,y),charging_stations(name,x,y),daily_vehicle_schedules(roster_sequence,earliest_departure_at,plan_route_ends(route_code,route_end_name))';
const normalizePlace = (value: string | null | undefined) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]/gi, '').toLowerCase();
function dispatchMode(task: any) {
  const depot = task.depots; const station = task.charging_stations;
  if (!depot || !station) return 'di_doi';
  const sameName = normalizePlace(depot.name) === normalizePlace(station.name);
  const distanceSquared = (Number(depot.x) - Number(station.x)) ** 2 + (Number(depot.y) - Number(station.y)) ** 2;
  return sameName || (Number.isFinite(distanceSquared) && distanceSquared <= 0.000004) ? 'dau_tram' : 'di_doi';
}

export async function GET() {
  let actor;
  try {
    actor = await getCurrentUserContext();
  } catch (caught) {
    if (caught instanceof UnauthenticatedError) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Bạn cần đăng nhập.' } }, { status: 401 });
    throw caught;
  }
  const db = createServiceRoleClient();
  const restricted = ['lai_xe', 'dieu_phoi'].includes(actor.role);
  const [planResult, assignmentsResult] = await Promise.all([
    db.from('daily_plans').select('id,service_date').order('service_date', { ascending: false }).limit(1).maybeSingle(),
    restricted ? db.from('employee_station_base_assignments').select('charging_station_id').eq('profile_id', actor.userId).eq('is_active', true) : Promise.resolve({ data: [] as { charging_station_id: string }[], error: null }),
  ]);
  if (planResult.error) return NextResponse.json({ error: { code: 'PLAN_QUERY_FAILED', message: planResult.error.message } }, { status: 500 });
  if (assignmentsResult.error) return NextResponse.json({ error: { code: 'ASSIGNMENT_QUERY_FAILED', message: assignmentsResult.error.message } }, { status: 500 });
  if (!planResult.data) return NextResponse.json({ tasks: [], plan: null, scope: { mode: 'all', stationIds: [] } });

  const stationIds = (assignmentsResult.data ?? []).map((row: { charging_station_id: string }) => row.charging_station_id);
  let query = db.from('dispatch_tasks').select(TASK_SELECT).eq('daily_plan_id', planResult.data.id).neq('status', 'qua_han').order('priority_lct_at', { ascending: true, nullsFirst: false });
  if (restricted) {
    query = stationIds.length
      ? query.or(`to_station_id.in.(${stationIds.join(',')}),assigned_profile_id.eq.${actor.userId}`)
      : query.eq('assigned_profile_id', actor.userId);
  }
  const { data: tasks, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'QUERY_FAILED', message: error.message } }, { status: 500 });

  return NextResponse.json({
    tasks: (tasks ?? []).map((task: any) => ({ ...task, movement_mode: task.task_type === 'di_chuyen' ? dispatchMode(task) : 'di_doi' })),
    plan: planResult.data,
    scope: { mode: restricted ? 'station' : 'all', stationIds },
    notice: restricted && !stationIds.length ? 'Bạn chưa được phân công trạm nào. Liên hệ admin để được cấp trạm làm việc.' : null,
  });
}
