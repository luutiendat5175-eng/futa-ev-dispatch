import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

export async function POST(request: NextRequest) {
  try {
    const actor = await getCurrentUserContext();
    if (actor.role !== 'admin') return NextResponse.json({ error: { message: 'Chỉ admin được phép xoá task vận hành.' } }, { status: 403 });
    const body = await request.json();
    if (body.confirmation !== 'XOA-TOAN-BO-TASK') return NextResponse.json({ error: { message: 'Xác nhận chưa đúng. Nhập chính xác: XOA-TOAN-BO-TASK' } }, { status: 400 });
    const db = createServiceRoleClient();
    const date = typeof body.serviceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.serviceDate) ? body.serviceDate : null;
    let query = db.from('daily_plans').select('id,service_date').order('service_date', { ascending: false }).limit(1);
    if (date) query = db.from('daily_plans').select('id,service_date').eq('service_date', date).limit(1);
    const { data: plan, error: planError } = await query.maybeSingle();
    if (planError) throw planError;
    if (!plan) return NextResponse.json({ error: { message: 'Không tìm thấy kế hoạch ngày cần xoá.' } }, { status: 404 });
    const { data: count, error } = await db.rpc('admin_archive_plan_tasks', { p_daily_plan_id: plan.id, p_actor_id: actor.userId });
    if (error) throw error;
    return NextResponse.json({ archived: count ?? 0, serviceDate: plan.service_date, message: `Đã đưa ${count ?? 0} task vào trạng thái quá hạn. Lịch sử, GPS và ảnh vẫn được giữ.` });
  } catch (caught) {
    return NextResponse.json({ error: { message: caught instanceof UnauthenticatedError ? 'Bạn cần đăng nhập lại.' : caught instanceof Error ? caught.message : 'Không thể xoá task.' } }, { status: 400 });
  }
}
