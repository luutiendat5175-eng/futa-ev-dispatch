import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

export async function GET() {
  try {
    const actor = await getCurrentUserContext();
    if (actor.role !== 'admin') return NextResponse.json({ error: { message: 'Chỉ admin.' } }, { status: 403 });
    const db = createServiceRoleClient();
    const [profiles, stations, assignments] = await Promise.all([
      db.from('profiles').select('id,employee_code,full_name,role').in('role', ['lai_xe', 'dieu_phoi']).eq('is_active', true),
      db.from('charging_stations').select('id,name'),
      db.from('employee_station_base_assignments').select('profile_id,charging_station_id').eq('is_active', true),
    ]);
    return NextResponse.json({ profiles: profiles.data ?? [], stations: stations.data ?? [], assignments: assignments.data ?? [], dailyPlanId: null });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return NextResponse.json({ error: { message: 'Đăng nhập lại.' } }, { status: 401 });
    throw error;
  }
}

export async function POST(request: Request) {
  const actor = await getCurrentUserContext();
  if (actor.role !== 'admin') return NextResponse.json({ error: { message: 'Chỉ admin.' } }, { status: 403 });
  const body = await request.json();
  if (!body.profileId || !Array.isArray(body.stationIds)) return NextResponse.json({ error: { message: 'Thiếu dữ liệu.' } }, { status: 400 });
  const db = createServiceRoleClient();
  await db.from('employee_station_base_assignments').delete().eq('profile_id', body.profileId);
  if (body.stationIds.length) {
    const { error } = await db.from('employee_station_base_assignments').insert(body.stationIds.map((charging_station_id: string) => ({ profile_id: body.profileId, charging_station_id, assigned_by: actor.userId })));
    if (error) return NextResponse.json({ error: { message: error.message } }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
