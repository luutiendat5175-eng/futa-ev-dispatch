import { NextResponse } from 'next/server';
import { createClient, createUserAccessTokenClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

function error(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(_request: Request, context: RouteContext<'/api/v1/tasks/[taskId]/claim'>) {
  try {
    const actor = await getCurrentUserContext();
    if (actor.role !== 'lai_xe') {
      return error('TASK_CLAIM_FORBIDDEN', 'Chỉ lái xe di dời được tự nhận task. Điều phối dùng chức năng phân công.', 403);
    }
    const db = await createClient();
    const { data: session, error: attendanceError } = await db.from('work_sessions').select('id').eq('profile_id', actor.userId).is('checked_out_at', null).limit(1).maybeSingle();
    if (attendanceError) throw attendanceError;
    if (!session) return error('ATTENDANCE_REQUIRED', 'Bạn cần chấm công vào ca trước khi nhận task.', 403);
  } catch (caught) {
    if (caught instanceof UnauthenticatedError) {
      return error('UNAUTHENTICATED', 'Bạn cần đăng nhập để nhận task.', 401);
    }
    throw caught;
  }

  const { taskId } = await context.params;
  const bearer = _request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabase = bearer ? createUserAccessTokenClient(bearer) : await createClient();
  const { data, error: claimError } = await supabase.rpc('claim_dispatch_task', {
    p_task_id: taskId,
  });

  if (claimError) {
    const isUnavailable = claimError.message.includes('TASK_NOT_AVAILABLE');
    const isMoving = claimError.message.includes('EMPLOYEE_ACTIVE_TASK');
    const cooldown = claimError.message.match(/EMPLOYEE_RECEIVE_COOLDOWN:(\d+)/)?.[1];
    return error(
      isMoving ? 'EMPLOYEE_ACTIVE_TASK' : cooldown ? 'EMPLOYEE_RECEIVE_COOLDOWN' : isUnavailable ? 'TASK_NOT_AVAILABLE' : 'TASK_CLAIM_FAILED',
      isUnavailable
        ? 'Task đã được nhận hoặc không thuộc trạm bạn được phân công.'
        : isMoving ? 'Bạn đang có một xe chưa hoàn tất. Hãy giao/trả xe hiện tại trước khi nhận xe khác.'
          : cooldown ? `Bạn cần nghỉ thêm ${cooldown} phút trước khi nhận xe tiếp theo.`
            : claimError.message,
      isUnavailable || isMoving || Boolean(cooldown) ? 409 : 400,
    );
  }

  return NextResponse.json({ task: data });
}
