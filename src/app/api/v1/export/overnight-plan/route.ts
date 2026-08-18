import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext } from '@/infrastructure/auth/getCurrentUserContext';
import { canPerform } from '@/shared/permissions/permissionMatrix';

const csv = (rows: (string | number | null)[][]) => `\uFEFF${rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;
export async function GET() {
  const actor = await getCurrentUserContext(); if (!canPerform(actor.role, 'import_bang_tuyen_sheet')) return NextResponse.json({ error: { message: 'Chỉ admin hoặc điều độ được xuất PA đậu đêm.' } }, { status: 403 });
  const db = createServiceRoleClient(); const { data: config, error: configError } = await db.from('overnight_plan_configs').select('id,version,effective_from,status').eq('status', 'active').maybeSingle(); if (configError) return NextResponse.json({ error: { message: configError.message } }, { status: 500 }); if (!config) return NextResponse.json({ error: { message: 'Chưa có PA đậu đêm cố định đang hiệu lực.' } }, { status: 404 });
  const { data, error } = await db.from('overnight_plan_config_ends').select('route_code,route_name,route_end_name,planned_vehicle_count,mobilization_minutes,buffer_minutes,note,depots(name),charging_stations(name)').eq('config_id', config.id).order('route_code').order('route_end_name'); if (error) return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  const body = csv([['Phiên bản', 'Hiệu lực từ', 'Mã tuyến', 'Tên tuyến', 'Đầu bến', 'Bãi đậu đêm', 'Trạm sạc', 'Số xe PA', 'Thời gian huy động (phút)', 'Buffer (phút)', 'Ghi chú'], ...(data ?? []).map((row: any) => [config.version, config.effective_from, row.route_code, row.route_name, row.route_end_name, row.depots?.name, row.charging_stations?.name, row.planned_vehicle_count, row.mobilization_minutes, row.buffer_minutes, row.note])]);
  return new NextResponse(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="pa-dau-dem-dang-hieu-luc.csv"' } });
}
