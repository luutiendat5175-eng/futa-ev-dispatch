import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

const canAcknowledge = (role: string) => role === 'admin' || role === 'dieu_phoi';

export async function GET() {
  try {
    const actor = await getCurrentUserContext();
    const db = createServiceRoleClient();

    let permitted: string[] | null = null;
    if (actor.role === 'lai_xe' || actor.role === 'dieu_phoi') {
      const { data, error } = await db.from('employee_station_base_assignments').select('charging_station_id').eq('profile_id', actor.userId).eq('is_active', true);
      if (error) throw error;
      permitted = (data ?? []).map((row: { charging_station_id: string }) => row.charging_station_id);
    }

    let query = db.from('violation_dashboard_alerts').select('id,created_at,charging_station_id,violation_cases!inner(id,violation_type,detected_at,resolved_at,recurrence_count,message,profiles(full_name,employee_code),vehicles(license_plate),charging_stations(name))').eq('is_acknowledged', false).eq('violation_cases.violation_type', 'priority_window').order('created_at', { ascending: false });
    if (permitted) query = permitted.length ? query.in('charging_station_id', permitted) : query.in('charging_station_id', ['00000000-0000-0000-0000-000000000000']);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ alerts: data ?? [], canAcknowledge: canAcknowledge(actor.role) });
  } catch (caught) {
    return NextResponse.json({ error: { message: caught instanceof UnauthenticatedError ? 'Bạn cần đăng nhập.' : caught instanceof Error ? caught.message : 'Không tải được cảnh báo vi phạm.' } }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await getCurrentUserContext();
    if (!canAcknowledge(actor.role)) return NextResponse.json({ error: { message: 'Chỉ admin hoặc điều phối được tắt cảnh báo vi phạm.' } }, { status: 403 });
    const body = await request.json();
    if (typeof body.id !== 'string' || !body.id) return NextResponse.json({ error: { message: 'Thiếu mã cảnh báo.' } }, { status: 400 });
    const db = createServiceRoleClient();
    const { data: alert, error: loadError } = await db.from('violation_dashboard_alerts').select('id,charging_station_id').eq('id', body.id).maybeSingle();
    if (loadError || !alert) return NextResponse.json({ error: { message: 'Không tìm thấy cảnh báo.' } }, { status: 404 });
    if (actor.role === 'dieu_phoi') {
      const { data: assignment } = await db.from('employee_station_base_assignments').select('id').eq('profile_id', actor.userId).eq('charging_station_id', alert.charging_station_id).eq('is_active', true).maybeSingle();
      if (!assignment) return NextResponse.json({ error: { message: 'Bạn chỉ được tắt cảnh báo thuộc trạm được phân công.' } }, { status: 403 });
    }
    const { error } = await db.from('violation_dashboard_alerts').update({ is_acknowledged: true, acknowledged_at: new Date().toISOString(), acknowledged_by: actor.userId }).eq('id', body.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (caught) {
    return NextResponse.json({ error: { message: caught instanceof Error ? caught.message : 'Không thể tắt cảnh báo.' } }, { status: 400 });
  }
}

