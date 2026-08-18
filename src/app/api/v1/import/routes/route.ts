import { NextRequest, NextResponse } from 'next/server';
import { parseOvernightConfigSheet } from '@/domain/route/parseOvernightConfigSheet';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';
import { canPerform } from '@/shared/permissions/permissionMatrix';

const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/[aeiouy]/g, '');
type DatabaseFailure = { message?: string; code?: string; details?: string | null; hint?: string | null };

function importFailure(caught: unknown) {
  const failure = (caught ?? {}) as DatabaseFailure;
  const message = failure.message || (caught instanceof Error ? caught.message : 'Không xác định được lỗi từ cơ sở dữ liệu.');
  const details = [failure.code ? `Mã lỗi PostgreSQL: ${failure.code}` : null, failure.details ? `Chi tiết: ${failure.details}` : null, failure.hint ? `Gợi ý: ${failure.hint}` : null].filter((item): item is string => Boolean(item));
  if (failure.code === '42703' && /route_end_key/i.test(message)) {
    return { message: 'Cơ sở dữ liệu chưa được cập nhật cho tuyến vòng tròn. Hãy chạy migration 202608150012_loop_route_end_keys.sql trong Supabase SQL Editor, rồi import lại.', details };
  }
  if (failure.code === '23505') return { message: `Dữ liệu PA bị trùng với một phiên bản đã có: ${message}`, details };
  return { message: `Không thể lưu PA: ${message}`, details };
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getCurrentUserContext();
    if (!canPerform(actor.role, 'import_bang_tuyen_sheet')) return NextResponse.json({ error: { message: 'Chỉ admin hoặc điều độ được cập nhật PA đậu đêm.' } }, { status: 403 });
    const form = await request.formData(); const file = form.get('file'); const effectiveFrom = String(form.get('effectiveFrom') ?? '').trim() || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    if (!(file instanceof File)) return NextResponse.json({ error: { message: 'Chọn file PA đậu đêm trước khi import.' } }, { status: 400 });
    const parsed = parseOvernightConfigSheet(Buffer.from(await file.arrayBuffer()), file.name); if (parsed.errors.length) return NextResponse.json({ error: { message: `File có ${parsed.errors.length} lỗi; chưa lưu dữ liệu nào.`, details: parsed.errors } }, { status: 422 });
    const db = createServiceRoleClient(); const [{ data: depots }, { data: stations }] = await Promise.all([db.from('depots').select('id,name').eq('is_active', true), db.from('charging_stations').select('id,name').eq('is_active', true)]);
    type Location = { id: string; name: string };
    const depotByName = new Map<string, Location>((depots ?? []).map((item: Location): [string, Location] => [key(item.name), item])); const stationByName = new Map<string, Location>((stations ?? []).map((item: Location): [string, Location] => [key(item.name), item]));
    const missing = parsed.rows.flatMap((row) => [
      !depotByName.has(key(row.depotName)) ? `Dòng ${row.sourceRow} · tuyến ${row.routeCode} · bãi “${row.depotName}” chưa có trong danh mục bãi đậu.` : null,
      !stationByName.has(key(row.stationName)) ? `Dòng ${row.sourceRow} · tuyến ${row.routeCode} · trạm “${row.stationName}” chưa có trong danh mục trạm sạc.` : null,
    ]).filter((item): item is string => Boolean(item));
    if (missing.length) return NextResponse.json({ error: { message: 'Không tìm thấy vị trí đã có trong danh mục. Hãy import/chỉnh sửa bãi hoặc trạm trước; PA không tự tạo vị trí mới.', details: missing } }, { status: 422 });
    const { data: maxVersion } = await db.from('overnight_plan_configs').select('version').order('version', { ascending: false }).limit(1).maybeSingle(); const version = (maxVersion?.version ?? 0) + 1;
    const { data: config, error: configError } = await db.from('overnight_plan_configs').insert({ version, status: 'draft', effective_from: effectiveFrom, source_name: file.name, imported_by: actor.userId }).select('id').single();
    if (configError || !config) throw configError ?? new Error('Không tạo được phiên bản PA.');
    const { error: endsError } = await db.from('overnight_plan_config_ends').insert(parsed.rows.map((row) => ({ config_id: config.id, route_code: row.routeCode, route_name: row.routeName, route_end_name: row.routeEndName, route_end_key: row.routeEndKey, overnight_depot_id: depotByName.get(key(row.depotName))!.id, charging_station_id: stationByName.get(key(row.stationName))!.id, planned_vehicle_count: row.plannedVehicleCount, mobilization_minutes: row.mobilizationMinutes, buffer_minutes: row.bufferMinutes, note: row.note })));
    if (endsError) { await db.from('overnight_plan_configs').delete().eq('id', config.id); throw endsError; }
    await db.from('overnight_plan_configs').update({ status: 'archived' }).eq('status', 'active');
    const { error: activateError } = await db.from('overnight_plan_configs').update({ status: 'active', activated_by: actor.userId, activated_at: new Date().toISOString() }).eq('id', config.id);
    if (activateError) throw activateError;
    return NextResponse.json({ version, rows: parsed.rows.length, message: `Đã kích hoạt PA đậu đêm phiên bản ${version}. Các bảng tài mới sẽ dùng phiên bản này.` });
  } catch (caught) {
    if (caught instanceof UnauthenticatedError) return NextResponse.json({ error: { message: 'Bạn cần đăng nhập lại.' } }, { status: 401 });
    const failure = importFailure(caught);
    return NextResponse.json({ error: failure }, { status: 400 });
  }
}
