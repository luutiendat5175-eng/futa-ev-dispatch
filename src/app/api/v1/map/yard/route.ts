import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

export async function GET() {
  try {
    const actor = await getCurrentUserContext();
    const db = createServiceRoleClient();
    const restricted = ['lai_xe', 'dieu_phoi'].includes(actor.role);
    const [planResult, assignmentsResult] = await Promise.all([
      db.from('daily_plans').select('id').order('service_date', { ascending: false }).limit(1).maybeSingle(),
      restricted ? db.from('employee_station_base_assignments').select('charging_station_id').eq('profile_id', actor.userId).eq('is_active', true) : Promise.resolve({ data: [] as { charging_station_id: string }[], error: null }),
    ]);
    if (planResult.error) throw planResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    const permitted = restricted ? new Set((assignmentsResult.data ?? []).map((row: { charging_station_id: string }) => row.charging_station_id)) : null;
    let stationQuery = db.from('charging_stations').select('id,name,x,y');
    if (permitted) stationQuery = permitted.size ? stationQuery.in('id', [...permitted]) : stationQuery.in('id', ['00000000-0000-0000-0000-000000000000']);
    const { data: stations, error: stationError } = await stationQuery;
    if (stationError) throw stationError;
    const stationIds = (stations ?? []).map((station: { id: string }) => station.id);
    const plan = planResult.data;
    const [{ data: ends, error: endError }, { data: events, error: eventError }] = await Promise.all([
      plan && stationIds.length ? db.from('plan_route_ends').select('overnight_depot_id').eq('daily_plan_id', plan.id).in('charging_station_id', stationIds) : Promise.resolve({ data: [], error: null }),
      plan && stationIds.length ? db.from('task_events').select('id,occurred_at,to_status,actor_profile_id,profiles!task_events_actor_profile_id_fkey(full_name),dispatch_tasks!inner(daily_plan_id,to_station_id,from_depot_id,vehicles(license_plate))').eq('dispatch_tasks.daily_plan_id', plan.id).in('dispatch_tasks.to_station_id', stationIds).order('occurred_at', { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
    ]);
    if (endError) throw endError;
    if (eventError) throw eventError;

    const depotIds = [...new Set([
      ...(ends ?? []).map((end: { overnight_depot_id: string | null }) => end.overnight_depot_id),
      ...(events ?? []).map((event: any) => event.dispatch_tasks?.from_depot_id as string | null),
    ].filter(Boolean))] as string[];
    const { data: depots, error: depotError } = depotIds.length ? await db.from('depots').select('id,name,x,y,address').in('id', depotIds) : { data: [], error: null };
    if (depotError) throw depotError;

    const latestByEmployee = new Map<string, any>();
    for (const event of (events ?? []) as any[]) if (event.actor_profile_id && !latestByEmployee.has(event.actor_profile_id)) latestByEmployee.set(event.actor_profile_id, event);
    const latestEventIds = [...latestByEmployee.values()].map((event) => event.id);
    const { data: alerts, error: alertError } = latestEventIds.length ? await db.from('operational_alerts').select('task_event_id,due_at').is('resolved_at', null).in('task_event_id', latestEventIds) : { data: [], error: null };
    if (alertError) throw alertError;
    const lateEventIds = new Map((alerts ?? []).map((alert: { task_event_id: string; due_at: string }) => [alert.task_event_id, alert.due_at]));
    const staffLocations = [...latestByEmployee.values()].flatMap((event) => {
      const task = event.dispatch_tasks;
      const common = { vehiclePlate: task?.vehicles?.license_plate ?? '—', employeeName: event.profiles?.full_name ?? '—', occurredAt: event.occurred_at, stationId: task?.to_station_id, depotId: task?.from_depot_id };
      const withAlert = { ...common, isLate: lateEventIds.has(event.id), dueAt: lateEventIds.get(event.id) };
      if (event.to_status === 'nhan_xe_dau_ben') return [{ ...withAlert, kind: 'outbound' }];
      if (['giao_tram_sac', 'doi_sac'].includes(event.to_status)) return [{ ...withAlert, kind: 'station' }];
      if (event.to_status === 'nhan_tram_sac') return [{ ...withAlert, kind: 'inbound' }];
      if (['giao_dau_ben', 'hoan_thanh'].includes(event.to_status)) return [{ ...withAlert, kind: 'depot' }];
      return [];
    });
    return NextResponse.json({ depots: depots ?? [], stations: stations ?? [], staffLocations });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return NextResponse.json({ error: { message: 'Bạn cần đăng nhập.' } }, { status: 401 });
    return NextResponse.json({ error: { message: error instanceof Error ? error.message : 'Không tải được bản đồ.' } }, { status: 500 });
  }
}
