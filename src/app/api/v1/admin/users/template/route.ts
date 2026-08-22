import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getCurrentUserContext } from '@/infrastructure/auth/getCurrentUserContext';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';

export async function GET() {
  const actor = await getCurrentUserContext();
  if (actor.role !== 'admin') return NextResponse.json({ error: { message: 'Chỉ admin.' } }, { status: 403 });
  const { data: stations } = await createServiceRoleClient().from('charging_stations').select('code').eq('is_active', true).order('code').limit(2);
  const codes = (stations ?? []).map((station: { code: string }) => station.code).join(',') || 'MA-TRAM-1,MA-TRAM-2';
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['MSNV', 'Họ tên', 'Vai trò', 'Hoạt động', 'Mã trạm'],
    ['NV001', 'Nguyễn Văn A', 'lai_xe', true, codes],
    ['NV002', 'Trần Thị B', 'dieu_phoi', true, (stations ?? [])[0]?.code ?? 'MA-TRAM-1'],
  ]);
  sheet['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(workbook, sheet, 'Nhân viên');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  return new NextResponse(bytes, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="mau-import-nhan-vien.xlsx"' } });
}
