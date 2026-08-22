import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

const canManage = (role: string) => role === 'admin' || role === 'dieu_phoi';

export async function GET() {
  try {
    const actor = await getCurrentUserContext(); const db = createServiceRoleClient();
    const now = new Date().toISOString();
    const query = db.from('system_announcements').select('id,message,visible_from,visible_until,is_active,created_at').eq('is_active', true).lte('visible_from', now).or(`visible_until.is.null,visible_until.gt.${now}`).order('created_at', { ascending: false });
    const { data, error } = await query; if (error) throw error;
    return NextResponse.json({ announcements: data ?? [], canManage: canManage(actor.role) });
  } catch (error) { return NextResponse.json({ error: { message: error instanceof UnauthenticatedError ? 'Đăng nhập lại.' : error instanceof Error ? error.message : 'Không tải được thông báo.' } }, { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentUserContext(); if (!canManage(actor.role)) return NextResponse.json({ error: { message: 'Chỉ admin hoặc điều phối được đăng thông báo.' } }, { status: 403 });
    const body = await request.json(); const message = String(body.message ?? '').trim(); const visibleFrom = body.visibleFrom ? new Date(body.visibleFrom) : new Date(); const visibleUntil = body.visibleUntil ? new Date(body.visibleUntil) : null;
    if (!message) return NextResponse.json({ error: { message: 'Nhập nội dung thông báo.' } }, { status: 400 });
    if (message.length > 1000) return NextResponse.json({ error: { message: 'Thông báo tối đa 1.000 ký tự.' } }, { status: 400 });
    if (Number.isNaN(visibleFrom.getTime()) || (visibleUntil && (Number.isNaN(visibleUntil.getTime()) || visibleUntil <= visibleFrom))) return NextResponse.json({ error: { message: 'Thời gian hiển thị không hợp lệ.' } }, { status: 400 });
    const { data, error } = await createServiceRoleClient().from('system_announcements').insert({ message, visible_from: visibleFrom.toISOString(), visible_until: visibleUntil?.toISOString() ?? null, created_by: actor.userId }).select().single(); if (error) throw error;
    return NextResponse.json({ announcement: data });
  } catch (error) { return NextResponse.json({ error: { message: error instanceof Error ? error.message : 'Không thể tạo thông báo.' } }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await getCurrentUserContext(); if (!canManage(actor.role)) return NextResponse.json({ error: { message: 'Không có quyền tắt thông báo.' } }, { status: 403 });
    const body = await request.json(); if (!body.id) return NextResponse.json({ error: { message: 'Thiếu mã thông báo.' } }, { status: 400 });
    const { error } = await createServiceRoleClient().from('system_announcements').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', body.id); if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: { message: error instanceof Error ? error.message : 'Không thể tắt thông báo.' } }, { status: 400 }); }
}
