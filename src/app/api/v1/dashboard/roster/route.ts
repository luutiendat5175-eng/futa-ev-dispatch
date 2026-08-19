import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

type ScheduleRow = {
  id: string; earliest_departure_at: string; lct_at: string; roster_sequence: number | null; plan_route_end_id: string;
  plan_route_ends: { route_code: string; route_name: string; route_end_name: string; charging_station_id: string; charging_stations: { name: string } | null } | null;
  vehicles: { license_plate: string } | null;
};
type TaskRow = { daily_vehicle_schedule_id: string | null; status: string };

export async function GET() {
  let actor;
  try { actor = await getCurrentUserContext(); } catch (caught) {
    if (caught instanceof UnauthenticatedError) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Bạn cần đăng nhập.' } }, { status: 401 });
    throw caught;
  }
  const db = createServiceRoleClient();
  const { data: plan } = await db.from('daily_plans').select('id').order('service_date', { ascending: false }).limit(1).maybeSingle();
  if (!plan) return NextResponse.json({ routes: [] });
  const [{ data: schedules, error }, { data: tasks }] = await Promise.all([
    db.from('daily_vehicle_schedules').select('id,earliest_departure_at,lct_at,roster_sequence,plan_route_end_id,plan_route_ends(route_code,route_name,route_end_name,charging_station_id,charging_stations(name)),vehicles(license_plate)').eq('daily_plan_id', plan.id),
    db.from('dispatch_tasks').select('daily_vehicle_schedule_id,status').eq('daily_plan_id', plan.id),
  ]);
  if (error) return NextResponse.json({ error: { code: 'QUERY_FAILED', message: error.message } }, { status: 500 });

  let permittedStationIds: Set<string> | null = null;
  if (actor.role === 'lai_xe' || actor.role === 'dieu_phoi') {
    const { data } = await db.from('employee_station_base_assignments').select('charging_station_id').eq('is_active', true).eq('profile_id', actor.userId);
    permittedStationIds = new Set((data ?? []).map((item: { charging_station_id: string }) => item.charging_station_id));
  }
  const taskBySchedule = new Map<string | null, TaskRow>((tasks ?? []).map((task: TaskRow): [string | null, TaskRow] => [task.daily_vehicle_schedule_id, task]));
  // Old duplicate-import cleanup preserves evidence by expiring duplicate tasks.
  // Do not let such expired/orphan schedules appear as current vehicles.
  const allSchedules = ((schedules ?? []) as ScheduleRow[]).filter((row) => {
    const status = taskBySchedule.get(row.id)?.status;
    return Boolean(status) && status !== 'qua_han';
  });
  const visible = allSchedules.filter((row) => !permittedStationIds || (row.plan_route_ends?.charging_station_id && permittedStationIds.has(row.plan_route_ends.charging_station_id)));
  // Priority is a queue inside each charging station.  Five stations may therefore
  // all have a vehicle with priority 1.
  const priority = new Map<string, number>();
  const byStation = new Map<string, ScheduleRow[]>();
  for (const row of allSchedules) { const stationId = row.plan_route_ends?.charging_station_id; if (stationId) byStation.set(stationId, [...(byStation.get(stationId) ?? []), row]); }
  for (const rows of byStation.values()) rows.sort((a, b) => a.lct_at.localeCompare(b.lct_at)).forEach((row, index) => priority.set(row.id, index + 1));
  const groups = new Map<string, { routeCode: string; routeName: string; ends: Map<string, { name: string; rows: unknown[] }> }>();

  for (const row of visible) {
    if (!row.plan_route_ends) continue;
    const endInfo = row.plan_route_ends;
    const route = groups.get(endInfo.route_code) ?? { routeCode: endInfo.route_code, routeName: endInfo.route_name, ends: new Map() };
    groups.set(endInfo.route_code, route);
    const end = route.ends.get(row.plan_route_end_id) ?? { name: endInfo.route_end_name, rows: [] };
    route.ends.set(row.plan_route_end_id, end);
    const status = taskBySchedule.get(row.id)?.status;
    const location = status === 'giao_dau_ben' || status === 'hoan_thanh' ? 'Đã sạc'
      : status === 'nhan_xe_dau_ben' ? 'Đang về sạc'
        : status === 'nhan_tram_sac' ? 'Đang trả xe'
          : status === 'giao_tram_sac' || status === 'doi_sac' ? 'Trạm sạc'
            : 'Chưa nhận';
    end.rows.push({ scheduleId: row.id, sequence: row.roster_sequence, departureAt: row.earliest_departure_at, licensePlate: row.vehicles?.license_plate ?? '—', priority: priority.get(row.id), chargingStation: endInfo.charging_stations?.name ?? '—', location });
  }
  const routeNumber = (code: string) => Number(code.replace(/\D/g, '')) || Number.MAX_SAFE_INTEGER;
  return NextResponse.json({ routes: [...groups.values()].sort((a, b) => routeNumber(a.routeCode) - routeNumber(b.routeCode) || a.routeCode.localeCompare(b.routeCode)).map((route) => ({ ...route, ends: [...route.ends.values()].map((end) => {
    const rows = (end.rows as { sequence: number | null; departureAt: string }[]).sort((a, b) => (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.departureAt.localeCompare(b.departureAt));
    return { ...end, rows: rows.map((row, index) => ({ ...row, sequence: index + 1 })) };
  }) })) });
}
