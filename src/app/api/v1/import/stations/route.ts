import { NextRequest, NextResponse } from 'next/server';
import { parseStationsSheet } from '@/domain/location/parseStationsSheet';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';
import { canPerform } from '@/shared/permissions/permissionMatrix';

function locationCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐðÐ]/g, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** POST /api/v1/import/stations - Body: multipart/form-data, field "file" = .xlsx (Tên trạm | X | Y | Công suất) */
export async function POST(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof getCurrentUserContext>>;
  try { actor = await getCurrentUserContext(); } catch (error) { return NextResponse.json({ error: { message: error instanceof UnauthenticatedError ? 'Bạn cần đăng nhập lại.' : 'Không xác minh được tài khoản.' } }, { status: 401 }); }
  if (!canPerform(actor.role, 'import_bang_tuyen_sheet')) return NextResponse.json({ error: { message: 'Chỉ admin hoặc điều độ được cập nhật dữ liệu nền.' } }, { status: 403 });
  const formData = await request.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: { code: 'IMPORT_FILE_MISSING', message: 'Thiếu file .xlsx trong field "file"' } },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { validRows, errors } = parseStationsSheet(buffer, file.name);

  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'IMPORT_VALIDATION_FAILED',
          message: `File có ${errors.length} dòng lỗi, không dòng nào được import`,
          details: errors,
        },
      },
      { status: 400 },
    );
  }
  if (validRows.length === 0) {
    return NextResponse.json(
      { error: { code: 'IMPORT_EMPTY_FILE', message: 'File không có dữ liệu' } },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  const { data: existing, error: readError } = await supabase.from('charging_stations').select('id,code,name,x,y');
  if (readError) return NextResponse.json({ error: { message: readError.message } }, { status: 500 });
  const incoming = validRows.map((row, index) => ({ ...row, code: locationCode(row.name), row: index + 2 }));
  const duplicateInput = incoming.filter((row, index) => incoming.findIndex((other) => other.code === row.code) !== index).map((row) => `Dòng ${row.row}: tên trạm trùng mã chuẩn hóa “${row.code}”.`);
  if (duplicateInput.length) return NextResponse.json({ error: { message: 'File có trạm sạc bị trùng, chưa lưu dữ liệu nào.', details: duplicateInput } }, { status: 422 });
  const matchKey = (value: string) => locationCode(value).replaceAll('-', '');
  const plans = incoming.map((row) => ({ row, candidates: (existing ?? []).filter((item: any) => item.code === row.code || matchKey(item.name) === matchKey(row.name) || (Math.abs(Number(item.x) - row.x) < 0.00001 && Math.abs(Number(item.y) - row.y) < 0.00001)) }));
  const ambiguous = plans.filter((plan) => plan.candidates.length > 1).map((plan) => `Dòng ${plan.row.row}: trạm “${plan.row.name}” khớp nhiều bản ghi cũ (${plan.candidates.map((item: any) => item.name).join('; ')}). Hãy gộp/xóa trùng trước.`);
  if (ambiguous.length) return NextResponse.json({ error: { message: 'Không thể thay thế an toàn vì có bản ghi trạm sạc trùng mơ hồ.', details: ambiguous } }, { status: 422 });
  let created = 0; let updated = 0;
  for (const plan of plans) {
    const payload = { code: plan.row.code, name: plan.row.name, x: plan.row.x, y: plan.row.y, is_active: true };
    const result = plan.candidates[0] ? await supabase.from('charging_stations').update(payload).eq('id', plan.candidates[0].id) : await supabase.from('charging_stations').insert(payload);
    if (result.error) return NextResponse.json({ error: { message: `Không thể lưu trạm “${plan.row.name}”: ${result.error.message}` } }, { status: 409 });
    if (plan.candidates[0]) updated += 1; else created += 1;
  }
  return NextResponse.json({ created, updated, message: `Đã đối chiếu ${plans.length} trạm: thêm ${created}, cập nhật an toàn ${updated}.` });
}
