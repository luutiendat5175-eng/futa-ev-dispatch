import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { canPerform } from '@/shared/permissions/permissionMatrix';
import type { TaskType } from '@/domain/task/taskStateMachine';

const taskTypes = new Set<TaskType>([
  'di_chuyen',
  'ho_tro',
  'kiem_tra',
  've_sinh',
  'dieu_dong',
  'phat_sinh',
]);

function error(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  let actor;
  try {
    actor = await getCurrentUserContext();
  } catch (caught) {
    if (caught instanceof UnauthenticatedError) {
      return error('UNAUTHENTICATED', 'Bạn cần đăng nhập để tạo tác vụ.', 401);
    }
    throw caught;
  }

  if (!canPerform(actor.role, 'tao_dieu_phoi_task')) {
    return error('FORBIDDEN', 'Vai trò hiện tại không có quyền tạo tác vụ.', 403);
  }

  let body: {
    vehicleId?: unknown;
    loaiTask?: unknown;
    fromLocationId?: unknown;
    toLocationId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return error('INVALID_JSON', 'Dữ liệu gửi lên không hợp lệ.', 400);
  }

  if (typeof body.vehicleId !== 'string' || body.vehicleId.trim() === '') {
    return error('VEHICLE_REQUIRED', 'Bạn cần chọn xe.', 400);
  }
  if (typeof body.loaiTask !== 'string' || !taskTypes.has(body.loaiTask as TaskType)) {
    return error('INVALID_TASK_TYPE', 'Loại tác vụ không hợp lệ.', 400);
  }
  if (body.fromLocationId !== null && body.fromLocationId !== undefined && typeof body.fromLocationId !== 'string') {
    return error('INVALID_LOCATION', 'Điểm đi không hợp lệ.', 400);
  }
  if (body.toLocationId !== null && body.toLocationId !== undefined && typeof body.toLocationId !== 'string') {
    return error('INVALID_LOCATION', 'Điểm đến không hợp lệ.', 400);
  }

  const loaiTask = body.loaiTask as TaskType;
  const supabase = createServiceRoleClient();
  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', body.vehicleId)
    .maybeSingle();

  if (vehicleError) return error('QUERY_FAILED', vehicleError.message, 500);
  if (!vehicle) return error('VEHICLE_NOT_FOUND', 'Xe không tồn tại hoặc không thể truy cập.', 404);

  const { data: dailyPlan, error: planError } = await supabase
    .from('daily_plans')
    .select('id')
    .eq('status', 'draft')
    .order('service_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planError) return error('QUERY_FAILED', planError.message, 500);
  if (!dailyPlan) return error('DAILY_PLAN_REQUIRED', 'Cần có kế hoạch ngày ở trạng thái nháp trước khi tạo task.', 409);

  const payload = {
    daily_plan_id: dailyPlan.id,
    task_type: loaiTask,
    vehicle_id: body.vehicleId,
    from_depot_id: typeof body.fromLocationId === 'string' && body.fromLocationId ? body.fromLocationId : null,
    to_station_id: typeof body.toLocationId === 'string' && body.toLocationId ? body.toLocationId : null,
    status: loaiTask === 'di_chuyen' ? 'chua_sac' : 'moi',
    created_by: actor.userId,
  };

  const { data: task, error: insertError } = await supabase
    .from('dispatch_tasks')
    .insert(payload)
    .select('*')
    .single();

  if (insertError) return error('CREATE_TASK_FAILED', insertError.message, 500);
  return NextResponse.json({ task }, { status: 201 });
}
