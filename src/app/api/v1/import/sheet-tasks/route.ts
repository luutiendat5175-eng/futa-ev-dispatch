import { NextRequest, NextResponse } from 'next/server';
import { parseInspectionSheetCsv } from '@/domain/sheet/parseInspectionSheetCsv';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';
import { canPerform } from '@/shared/permissions/permissionMatrix';

/**
 * POST /api/v1/import/sheet-tasks
 * Body: { sheetCsvUrl: string }
 *
 * Đồng bộ Google Sheet (đã "Xuất bản lên web" dạng CSV) -> tạo hàng loạt Task
 * kiểm tra (loai_task='kiem_tra'). CHỈ chạy khi được bấm tay - không cron/polling
 * tự động đọc liên tục, giữ đúng nguyên tắc thiết kế gốc.
 *
 * Quyền: giống tạo Task thường - Quản lý/Admin (đúng Permission Matrix "tao_dieu_phoi_task").
 */
export async function POST(request: NextRequest) {
  let actor;
  try {
    actor = await getCurrentUserContext();
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: err.message } },
        { status: 401 },
      );
    }
    throw err;
  }

  if (!canPerform(actor.role, 'tao_dieu_phoi_task')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Role này không được tạo Task' } },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { sheetCsvUrl } = body as { sheetCsvUrl?: string };

  if (!sheetCsvUrl) {
    return NextResponse.json(
      { error: { code: 'SHEET_URL_MISSING', message: 'Thiếu sheetCsvUrl' } },
      { status: 400 },
    );
  }

  let csvText: string;
  try {
    const res = await fetch(sheetCsvUrl);
    if (!res.ok) {
      return NextResponse.json(
        {
          error: {
            code: 'SHEET_FETCH_FAILED',
            message: `Không tải được Sheet (status ${res.status}) - kiểm tra lại đã "Xuất bản lên web" chưa`,
          },
        },
        { status: 400 },
      );
    }
    csvText = await res.text();
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'SHEET_FETCH_FAILED', message: String(err) } },
      { status: 400 },
    );
  }

  const { validRows, errors } = parseInspectionSheetCsv(csvText);

  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'SHEET_VALIDATION_FAILED',
          message: `Sheet có ${errors.length} dòng lỗi`,
          details: errors,
        },
      },
      { status: 400 },
    );
  }
  if (validRows.length === 0) {
    return NextResponse.json(
      { error: { code: 'SHEET_EMPTY', message: 'Sheet không có dòng hợp lệ nào' } },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();

  // Tra cứu vehicle_id theo biển số - Task nào không tìm thấy xe sẽ báo lỗi rõ,
  // KHÔNG âm thầm bỏ qua (tránh Điều độ tưởng đã tạo xong nhưng thực ra thiếu).
  const bienSoList = Array.from(new Set(validRows.map((r) => r.bienSo)));
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, bien_so')
    .in('bien_so', bienSoList);

  const vehicleIdByBienSo = new Map<string, string>(
    (vehicles ?? []).map((v: { id: string; bien_so: string }) => [v.bien_so, v.id]),
  );
  const notFound = bienSoList.filter((b) => !vehicleIdByBienSo.has(b));

  if (notFound.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'VEHICLE_NOT_FOUND',
          message: `Không tìm thấy xe theo biển số trong hệ thống: ${notFound.join(', ')}`,
        },
      },
      { status: 404 },
    );
  }

  const tasksToInsert = validRows.map((row) => ({
    loai_task: 'kiem_tra',
    vehicle_id: vehicleIdByBienSo.get(row.bienSo),
    trang_thai: 'moi',
    created_by: actor.userId,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('dispatch_tasks')
    .insert(tasksToInsert)
    .select('id');

  if (insertError) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: insertError.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ created: inserted?.length ?? 0 }, { status: 201 });
}

