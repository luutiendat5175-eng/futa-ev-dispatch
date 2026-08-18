import { NextRequest, NextResponse } from 'next/server';
import { parseStationsSheet } from '@/domain/location/parseStationsSheet';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';

function locationCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** POST /api/v1/import/stations - Body: multipart/form-data, field "file" = .xlsx (Tên trạm | X | Y | Công suất) */
export async function POST(request: NextRequest) {
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
  // Công suất/cổng sạc được bỏ qua theo phạm vi vận hành hiện tại.
  const { data, error } = await supabase
    .from('charging_stations')
    .upsert(
      validRows.map(({ capacity: _capacity, ...row }) => ({ ...row, code: locationCode(row.name) })),
      { onConflict: 'code' },
    )
    .select('id');

  if (error) {
    return NextResponse.json(
      { error: { code: 'IMPORT_DB_ERROR', message: error.message } },
      { status: 409 },
    );
  }

  return NextResponse.json({ inserted: data?.length ?? 0, message: `Đã import/cập nhật ${data?.length ?? 0} trạm sạc.` }, { status: 200 });
}
