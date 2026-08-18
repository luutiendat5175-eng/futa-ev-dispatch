import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext } from '@/infrastructure/auth/getCurrentUserContext';
import { canPerform } from '@/shared/permissions/permissionMatrix';

const csv = (rows: (string | number | null)[][]) => `\uFEFF${rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;

export async function GET() {
  const actor = await getCurrentUserContext();
  if (!canPerform(actor.role, 'import_bang_tuyen_sheet')) return NextResponse.json({ error: { message: 'Chỉ admin hoặc điều độ được xuất dữ liệu nền.' } }, { status: 403 });
  const { data, error } = await createServiceRoleClient().from('depots').select('code,name,x,y,address,is_active').order('code');
  if (error) return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  const body = csv([['Mã bãi', 'Tên bãi', 'X', 'Y', 'Địa chỉ', 'Đang hoạt động'], ...(data ?? []).map((row: any) => [row.code, row.name, row.x, row.y, row.address, row.is_active ? 'Có' : 'Không'])]);
  return new NextResponse(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="danh-muc-bai-do.csv"' } });
}
