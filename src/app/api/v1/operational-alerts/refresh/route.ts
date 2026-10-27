import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

export async function POST() {
  try {
    await getCurrentUserContext();
    const db = createServiceRoleClient();
    const { data: plan, error: planError } = await db.from('daily_plans').select('id').order('service_date', { ascending: false }).limit(1).maybeSingle();
    if (planError) throw planError;
    if (!plan) return NextResponse.json({ ok: true, refreshed: 0 });
    const { data: refreshed, error } = await db.rpc('refresh_operational_alerts', { p_daily_plan_id: plan.id });
    if (error) throw error;
    return NextResponse.json({ ok: true, refreshed: refreshed ?? 0 });
  } catch (caught) {
    const status = caught instanceof UnauthenticatedError ? 401 : 500;
    return NextResponse.json({ error: { message: caught instanceof UnauthenticatedError ? 'Bạn cần đăng nhập.' : caught instanceof Error ? caught.message : 'Không thể cập nhật cảnh báo vận hành.' } }, { status });
  }
}
