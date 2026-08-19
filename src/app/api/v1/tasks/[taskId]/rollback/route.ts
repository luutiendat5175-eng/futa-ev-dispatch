import { NextResponse } from 'next/server';
import { createUserAccessTokenClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

export async function POST(request: Request, context: RouteContext<'/api/v1/tasks/[taskId]/rollback'>) {
  try {
    const actor = await getCurrentUserContext();
    if (actor.role !== 'admin') return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Chỉ admin được rollback task.' } }, { status: 403 });
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Phiên đăng nhập không hợp lệ.' } }, { status: 401 });
    const body = await request.json();
    if (typeof body.targetStatus !== 'string') return NextResponse.json({ error: { code: 'STATUS_REQUIRED', message: 'Chọn trạng thái cần rollback.' } }, { status: 400 });
    const { taskId } = await context.params;
    const { data, error } = await createUserAccessTokenClient(token).rpc('rollback_dispatch_task', { p_task_id: taskId, p_target_status: body.targetStatus, p_note: typeof body.note === 'string' ? body.note.slice(0, 500) : null });
    if (error) return NextResponse.json({ error: { code: 'ROLLBACK_FAILED', message: error.message } }, { status: 409 });
    return NextResponse.json({ event: data });
  } catch (caught) { if (caught instanceof UnauthenticatedError) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Bạn cần đăng nhập.' } }, { status: 401 }); throw caught; }
}
