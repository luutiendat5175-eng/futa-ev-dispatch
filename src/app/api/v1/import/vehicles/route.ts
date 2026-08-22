import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { readWorkbookForImport } from '@/shared/spreadsheets/readWorkbook';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';
import { canPerform } from '@/shared/permissions/permissionMatrix';

export const runtime = 'nodejs';

const text = (value: unknown) => String(value ?? '').trim().toUpperCase();

export async function POST(request: NextRequest) {
  try {
    const actor = await getCurrentUserContext();
    if (!canPerform(actor.role, 'import_bang_tuyen_sheet')) return NextResponse.json({ error: { message: 'Chỉ admin hoặc điều độ được cập nhật danh mục xe.' } }, { status: 403 });
    const form = await request.formData(); const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: { message: 'Chọn file danh mục xe trước khi import.' } }, { status: 400 });
    const workbook = readWorkbookForImport(Buffer.from(await file.arrayBuffer()), file.name);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '', raw: false }) as unknown[][];
    const incoming = rows.slice(1).map((row, index) => ({ licensePlate: text(row[0]), vehicleTypeCode: text(row[1]), sourceRow: index + 2 })).filter((row) => row.licensePlate || row.vehicleTypeCode);
    const errors = incoming.flatMap((row) => !row.licensePlate || !row.vehicleTypeCode ? [`Dòng ${row.sourceRow}: cần đủ Biển số và Loại xe.`] : []);
    const duplicates = incoming.filter((row, index) => incoming.findIndex((item) => item.licensePlate === row.licensePlate) !== index);
    if (duplicates.length) errors.push(...duplicates.map((row) => `Dòng ${row.sourceRow}: biển số ${row.licensePlate} bị trùng trong file.`));
    if (!incoming.length) errors.push('File không có dữ liệu xe.');
    if (errors.length) return NextResponse.json({ error: { message: `File có ${errors.length} lỗi; chưa lưu dữ liệu nào.`, details: errors } }, { status: 422 });
    const db = createServiceRoleClient();
    const { data: types, error: typeError } = await db.from('vehicle_types').select('code').in('code', [...new Set(incoming.map((row) => row.vehicleTypeCode))]);
    if (typeError) throw typeError;
    const validTypes = new Set((types ?? []).map((row: { code: string }) => row.code));
    const invalid = incoming.filter((row) => !validTypes.has(row.vehicleTypeCode));
    if (invalid.length) return NextResponse.json({ error: { message: 'File có loại xe không tồn tại hoặc đã ngừng dùng.', details: invalid.map((row) => `Dòng ${row.sourceRow}: loại xe ${row.vehicleTypeCode}.`) } }, { status: 422 });
    const plates = incoming.map((row) => row.licensePlate);
    const { data: existing, error: readError } = await db.from('vehicles').select('license_plate').in('license_plate', plates);
    if (readError) throw readError;
    const existingPlates = new Set((existing ?? []).map((row: { license_plate: string }) => row.license_plate));
    const { error } = await db.from('vehicles').upsert(incoming.map((row) => ({ license_plate: row.licensePlate, vehicle_type_code: row.vehicleTypeCode, is_active: true })), { onConflict: 'license_plate' });
    if (error) throw error;
    const updated = incoming.filter((row) => existingPlates.has(row.licensePlate)).length;
    return NextResponse.json({ created: incoming.length - updated, updated, message: `Đã đối chiếu ${incoming.length} xe: thêm ${incoming.length - updated}, cập nhật ${updated}.` });
  } catch (caught) {
    return NextResponse.json({ error: { message: caught instanceof UnauthenticatedError ? 'Bạn cần đăng nhập lại.' : caught instanceof Error ? caught.message : 'Import danh mục xe thất bại.' } }, { status: caught instanceof UnauthenticatedError ? 401 : 400 });
  }
}
