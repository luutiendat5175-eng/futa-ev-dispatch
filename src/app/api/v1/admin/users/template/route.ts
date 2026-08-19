import { NextResponse } from 'next/server';
import { getCurrentUserContext } from '@/infrastructure/auth/getCurrentUserContext';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';

export async function GET() {
  const actor = await getCurrentUserContext();
  if (actor.role !== 'admin') return NextResponse.json({ error: { message: 'Chỉ admin.' } }, { status: 403 });
  const { data: stations } = await createServiceRoleClient().from('charging_stations').select('code').eq('is_active', true).order('code').limit(2);
  const codes = (stations ?? []).map((station: { code: string }) => station.code).join(',') || 'MA-TRAM-1,MA-TRAM-2';
  const csv = `\uFEFFMSNV,Họ tên,Vai trò,Hoạt động,Mã trạm\r\nNV001,Nguyễn Văn A,lai_xe,TRUE,"${codes}"\r\nNV002,Trần Thị B,dieu_phoi,TRUE,"${(stations ?? [])[0]?.code ?? 'MA-TRAM-1'}"\r\n`;
  return new NextResponse(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="mau-import-nhan-vien.csv"' } });
}
