import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

const add = (target: Record<string, number>, type: string) => target[type] = (target[type] ?? 0) + 1;

export async function GET() {
  let actor;
  try { actor = await getCurrentUserContext(); } catch (caught) { if (caught instanceof UnauthenticatedError) return NextResponse.json({ error: { message: 'Bạn cần đăng nhập.' } }, { status: 401 }); throw caught; }
  const db = createServiceRoleClient(); const { data: plan } = await db.from('daily_plans').select('id').order('service_date', { ascending: false }).limit(1).maybeSingle(); if (!plan) return NextResponse.json({ stations: [] });
  const { data, error } = await db.from('dispatch_tasks').select('status,to_station_id,from_depot_id,charging_stations(name),depots(name),vehicles(vehicle_type_code)').eq('daily_plan_id', plan.id).eq('task_type', 'di_chuyen');
  if (error) return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  let allowed: Set<string> | null = null;
  if (actor.role === 'lai_xe' || actor.role === 'dieu_phoi') { const { data: assignments } = await db.from('employee_station_base_assignments').select('charging_station_id').eq('is_active', true).eq('profile_id', actor.userId); allowed = new Set((assignments ?? []).map((row: { charging_station_id: string }) => row.charging_station_id)); }
  const stations = new Map<string, { name: string; atStation: Record<string, number>; depots: Map<string, { name: string; charged: Record<string, number>; waiting: Record<string, number> }>; outbound: Record<string, number>; returning: Record<string, number> }>();
  for (const task of (data ?? []) as any[]) {
    if (!task.to_station_id || (allowed && !allowed.has(task.to_station_id))) continue;
    const type = task.vehicles?.vehicle_type_code ?? 'Chưa rõ'; const station = stations.get(task.to_station_id) ?? { name: task.charging_stations?.name ?? 'Trạm sạc', atStation: {}, depots: new Map(), outbound: {}, returning: {} }; stations.set(task.to_station_id, station);
    const depot = task.from_depot_id ? station.depots.get(task.from_depot_id) ?? { name: task.depots?.name ?? 'Bãi đỗ', charged: {}, waiting: {} } : null; if (task.from_depot_id && depot) station.depots.set(task.from_depot_id, depot);
    if (task.status === 'giao_tram_sac') add(station.atStation, type); else if (task.status === 'nhan_xe_dau_ben') add(station.outbound, type); else if (task.status === 'nhan_tram_sac') add(station.returning, type); else if (depot && task.status === 'chua_sac') add(depot.waiting, type); else if (depot && (task.status === 'giao_dau_ben' || task.status === 'hoan_thanh')) add(depot.charged, type);
  }
  return NextResponse.json({ stations: [...stations.values()].map((station) => ({ name: station.name, atStation: station.atStation, depots: [...station.depots.values()], outbound: station.outbound, returning: station.returning })) });
}
