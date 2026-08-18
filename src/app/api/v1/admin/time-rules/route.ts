import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

const fail = (message: string, status = 400) => NextResponse.json({ error: { message } }, { status });
async function requireAdmin() { const actor = await getCurrentUserContext(); if (actor.role !== 'admin') throw new Error('ADMIN_ONLY'); return actor; }

export async function GET() {
  try {
    await requireAdmin(); const db = createServiceRoleClient();
    const [stations, depots, rules, windows] = await Promise.all([
      db.from('charging_stations').select('id,name').eq('is_active', true).order('name'),
      db.from('depots').select('id,name').eq('is_active', true).order('name'),
      db.from('station_time_rules').select('id,charging_station_id,depot_id,outbound_minutes,return_minutes,station_wait_minutes,depot_wait_minutes,min_receive_gap_minutes,zalo_group_label,violation_pilot_enabled').order('created_at'),
      db.from('station_priority_windows').select('id,charging_station_id,starts_at,ends_at,priority_min,priority_max,is_active').order('starts_at'),
    ]);
    if (stations.error || depots.error || rules.error || windows.error) throw stations.error ?? depots.error ?? rules.error ?? windows.error;
    return NextResponse.json({ stations: stations.data ?? [], depots: depots.data ?? [], rules: rules.data ?? [], priorityWindows: windows.data ?? [] });
  } catch (caught) {
    if (caught instanceof UnauthenticatedError) return fail('Bạn cần đăng nhập.', 401);
    if (caught instanceof Error && caught.message === 'ADMIN_ONLY') return fail('Chỉ admin được cấu hình thời gian điều phối.', 403);
    return fail(caught instanceof Error ? caught.message : 'Không tải được cấu hình.', 500);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(); const body = await request.json(); const stationId = typeof body.stationId === 'string' ? body.stationId : ''; const depotId = typeof body.depotId === 'string' && body.depotId ? body.depotId : null;
    const keys = ['outboundMinutes', 'returnMinutes', 'stationWaitMinutes', 'depotWaitMinutes', 'minReceiveGapMinutes'] as const;
    const values = Object.fromEntries(keys.map((key) => [key, Number(body[key])])) as Record<(typeof keys)[number], number>;
    if (!stationId || keys.some((key) => !Number.isInteger(values[key]) || values[key] < (key === 'minReceiveGapMinutes' ? 0 : 1))) return fail('Thời gian phải là số phút hợp lệ; khoảng cách nhận xe có thể bằng 0.');
    const groupLabel = typeof body.zaloGroupLabel === 'string' ? body.zaloGroupLabel.trim().slice(0, 120) : '';
    const db = createServiceRoleClient(); let query = db.from('station_time_rules').select('id').eq('charging_station_id', stationId); query = depotId ? query.eq('depot_id', depotId) : query.is('depot_id', null);
    const existing = await query.maybeSingle(); if (existing.error) throw existing.error;
    const record = { charging_station_id: stationId, depot_id: depotId, outbound_minutes: values.outboundMinutes, return_minutes: values.returnMinutes, station_wait_minutes: values.stationWaitMinutes, depot_wait_minutes: values.depotWaitMinutes, min_receive_gap_minutes: values.minReceiveGapMinutes, zalo_group_label: groupLabel || null, violation_pilot_enabled: Boolean(body.violationPilotEnabled), is_active: true, updated_by: actor.userId };
    const saved = existing.data ? await db.from('station_time_rules').update({ ...record, updated_at: new Date().toISOString() }).eq('id', existing.data.id).select().single() : await db.from('station_time_rules').insert({ ...record, created_by: actor.userId }).select().single();
    if (saved.error) throw saved.error;
    return NextResponse.json({ rule: saved.data });
  } catch (caught) {
    if (caught instanceof UnauthenticatedError) return fail('Bạn cần đăng nhập.', 401);
    if (caught instanceof Error && caught.message === 'ADMIN_ONLY') return fail('Chỉ admin được cấu hình thời gian điều phối.', 403);
    return fail(caught instanceof Error ? caught.message : 'Không lưu được cấu hình.', 500);
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireAdmin(); const body = await request.json(); const stationId = typeof body.stationId === 'string' ? body.stationId : ''; const windows: Array<{ startsAt: string; endsAt: string; priorityMin: number; priorityMax: number }> = Array.isArray(body.windows) ? body.windows : [];
    if (!stationId || windows.some((item: { startsAt: string; endsAt: string; priorityMin: number; priorityMax: number }) => !/^\d{2}:\d{2}/.test(String(item.startsAt)) || !/^\d{2}:\d{2}/.test(String(item.endsAt)) || !Number.isInteger(Number(item.priorityMin)) || !Number.isInteger(Number(item.priorityMax)) || Number(item.priorityMin) < 1 || Number(item.priorityMax) < Number(item.priorityMin))) return fail('Khung ưu tiên không hợp lệ. Dùng dạng giờ HH:MM và ưu tiên là số nguyên dương.');
    const db = createServiceRoleClient(); const { error: removeError } = await db.from('station_priority_windows').delete().eq('charging_station_id', stationId); if (removeError) throw removeError;
    if (windows.length) {
      const { error } = await db.from('station_priority_windows').insert(windows.map((item: { startsAt: string; endsAt: string; priorityMin: number; priorityMax: number }) => ({ charging_station_id: stationId, starts_at: item.startsAt, ends_at: item.endsAt, priority_min: Number(item.priorityMin), priority_max: Number(item.priorityMax), is_active: true, created_by: actor.userId, updated_by: actor.userId })));
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (caught) {
    if (caught instanceof UnauthenticatedError) return fail('Bạn cần đăng nhập.', 401);
    if (caught instanceof Error && caught.message === 'ADMIN_ONLY') return fail('Chỉ admin được cấu hình ưu tiên.', 403);
    return fail(caught instanceof Error ? caught.message : 'Không lưu được khung ưu tiên.', 500);
  }
}
