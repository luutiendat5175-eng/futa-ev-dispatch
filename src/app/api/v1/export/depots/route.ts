import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext } from '@/infrastructure/auth/getCurrentUserContext';
import { canPerform } from '@/shared/permissions/permissionMatrix';

export const runtime = 'nodejs';

export async function GET() {
  const actor = await getCurrentUserContext();
  if (!canPerform(actor.role, 'import_bang_tuyen_sheet')) return NextResponse.json({ error: { message: 'Chỉ admin hoặc điều độ được xuất dữ liệu nền.' } }, { status: 403 });
  const { data, error } = await createServiceRoleClient().from('depots').select('name,x,y,address').order('name');
  if (error) return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Tên bãi', 'X', 'Y', 'Địa chỉ'], ...(data ?? []).map((row: any) => [row.name, row.x, row.y, row.address ?? ''])]), 'Bãi đậu');
  return new NextResponse(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="danh-muc-bai-do.xlsx"' } });
}
