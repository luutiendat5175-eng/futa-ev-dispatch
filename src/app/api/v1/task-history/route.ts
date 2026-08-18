import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

export async function GET(request: Request) {
  let actor;
  try { actor = await getCurrentUserContext(); } catch (caught) {
    if (caught instanceof UnauthenticatedError) return NextResponse.json({ error: { message: 'Bạn cần đăng nhập.' } }, { status: 401 });
    throw caught;
  }
  const params = new URL(request.url).searchParams;
  const db = createServiceRoleClient();
  const { data: events, error } = await db.from('task_events')
    .select('id,task_id,event_type,from_status,to_status,occurred_at,latitude,longitude,gps_accuracy_m,note,actor_profile_id,profiles!task_events_actor_profile_id_fkey(full_name,employee_code),dispatch_tasks(daily_plan_id,to_station_id,from_depot_id,vehicles(license_plate),daily_vehicle_schedules(plan_route_ends(route_code)),charging_stations(name),depots(name))')
    .order('occurred_at', { ascending: false }).limit(1000);
  if (error) return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  let result = (events ?? []) as any[];
  if (['lai_xe', 'dieu_phoi'].includes(actor.role)) {
    const { data: assignments } = await db.from('employee_station_base_assignments').select('charging_station_id').eq('profile_id', actor.userId).eq('is_active', true);
    const permitted = new Set((assignments ?? []).map((row: { charging_station_id: string }) => row.charging_station_id));
    result = result.filter((event) => permitted.has(event.dispatch_tasks?.to_station_id));
  }
  const search = params.get('search')?.trim().toLowerCase(); const stationId = params.get('stationId'); const from = params.get('from'); const to = params.get('to');
  result = result.filter((event) => (!stationId || event.dispatch_tasks?.to_station_id === stationId) && (!from || event.occurred_at >= from) && (!to || event.occurred_at <= `${to}T23:59:59.999Z`) && (!search || `${event.dispatch_tasks?.vehicles?.license_plate ?? ''} ${event.dispatch_tasks?.daily_vehicle_schedules?.plan_route_ends?.route_code ?? ''} ${event.profiles?.full_name ?? ''} ${event.profiles?.employee_code ?? ''}`.toLowerCase().includes(search)));
  return NextResponse.json({ events: result });
}
