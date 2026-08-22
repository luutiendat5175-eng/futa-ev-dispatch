import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext } from '@/infrastructure/auth/getCurrentUserContext';

export async function GET(request: NextRequest) {
  try {
    const actor = await getCurrentUserContext(); const vehicleId = new URL(request.url).searchParams.get('vehicleId'); if (!vehicleId) return NextResponse.json({ error: { message: 'Thiếu mã xe QR.' } }, { status: 400 });
    const db = createServiceRoleClient(); const { data: plan } = await db.from('daily_plans').select('id').order('service_date', { ascending: false }).limit(1).maybeSingle(); if (!plan) return NextResponse.json({ error: { message: 'Chưa có kế hoạch vận hành.' } }, { status: 404 });
    const { data: task, error } = await db.from('dispatch_tasks').select('id,status,assigned_profile_id,vehicle_id,priority_lct_at,vehicles(license_plate),daily_vehicle_schedules(roster_sequence,earliest_departure_at,plan_route_ends(route_code,route_end_name,charging_station_id))').eq('daily_plan_id', plan.id).eq('vehicle_id', vehicleId).neq('status', 'hoan_thanh').order('priority_lct_at').limit(1).maybeSingle(); if (error) throw error; if (!task) return NextResponse.json({ error: { message: 'Xe chưa có task chưa hoàn thành trong kế hoạch hiện tại.' } }, { status: 404 });
    const schedule = Array.isArray(task.daily_vehicle_schedules) ? task.daily_vehicle_schedules[0] : task.daily_vehicle_schedules; const end = schedule && (Array.isArray(schedule.plan_route_ends) ? schedule.plan_route_ends[0] : schedule.plan_route_ends);
    if ((actor.role === 'lai_xe' || actor.role === 'dieu_phoi') && end?.charging_station_id) { const { data: assignment } = await db.from('employee_station_base_assignments').select('id').eq('profile_id', actor.userId).eq('charging_station_id', end.charging_station_id).eq('is_active', true).maybeSingle(); if (!assignment && task.assigned_profile_id !== actor.userId) return NextResponse.json({ error: { message: 'Xe này không thuộc trạm bạn được phân công.' } }, { status: 403 }); }
    const { data: ordered } = await db.from('dispatch_tasks').select('id').eq('daily_plan_id', plan.id).eq('task_type', 'di_chuyen').neq('status', 'hoan_thanh').order('priority_lct_at'); const priority = (ordered ?? []).findIndex((item: { id: string }) => item.id === task.id) + 1;
    return NextResponse.json({ task: { id: task.id, status: task.status, assignedUserId: task.assigned_profile_id, licensePlate: (Array.isArray(task.vehicles) ? task.vehicles[0] : task.vehicles)?.license_plate ?? '—', routeCode: end?.route_code ?? '—', routeEndName: end?.route_end_name ?? '—', sequence: schedule?.roster_sequence ?? null, priority: priority || null, departureAt: schedule?.earliest_departure_at ?? null } });
  } catch (caught) { return NextResponse.json({ error: { message: caught instanceof Error ? caught.message : 'Không đọc được QR xe.' } }, { status: 400 }); }
}
