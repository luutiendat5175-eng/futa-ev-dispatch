import { NextRequest, NextResponse } from 'next/server';
import {
  dedupeScheduleRowsByVehicle,
  sortByLctTimeAscending,
  groupByRouteAndDepot,
  type ScheduleRow,
} from '@/domain/schedule/vehicleListView';
import { createClient } from '@/infrastructure/supabase/server';

/**
 * GET /api/v1/vehicle-list?date=YYYY-MM-DD&mode=lct|route
 *
 * mode=lct   -> Chế độ 1: danh sách xe sắp xếp theo LCT tăng dần
 * mode=route -> Chế độ 2: group theo Tuyến -> Đầu A/Đầu B (kiểm tra cân bằng số xe)
 *
 * Toàn bộ logic dedupe/sort/group nằm ở domain/schedule/vehicleListView.ts -
 * route handler này CHỈ query dữ liệu thô rồi gọi domain function, không tự viết
 * lại logic nghiệp vụ (đúng nguyên tắc thiết kế).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const mode = searchParams.get('mode') ?? 'lct';

  if (mode !== 'lct' && mode !== 'route') {
    return NextResponse.json(
      { error: { code: 'INVALID_MODE', message: 'mode phải là "lct" hoặc "route"' } },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('daily_schedule')
    .select(
      `
      vehicle_id,
      lct_time,
      vehicles ( bien_so ),
      route_ends (
        id,
        diem_dau,
        routes ( mst, ten_tuyen )
      )
    `,
    )
    .eq('ngay', date);

  if (error) {
    return NextResponse.json(
      { error: { code: 'QUERY_FAILED', message: error.message } },
      { status: 500 },
    );
  }

  type RawRow = {
    vehicle_id: string;
    lct_time: string | null;
    vehicles: { bien_so: string } | null;
    route_ends: {
      id: string;
      diem_dau: string;
      routes: { mst: string; ten_tuyen: string } | null;
    } | null;
  };

  const scheduleRows: ScheduleRow[] = ((data ?? []) as unknown as RawRow[])
    .filter((r) => r.vehicles && r.route_ends && r.route_ends.routes)
    .map((r) => ({
      vehicleId: r.vehicle_id,
      bienSo: r.vehicles!.bien_so,
      routeEndId: r.route_ends!.id,
      diemDau: r.route_ends!.diem_dau,
      mst: r.route_ends!.routes!.mst,
      tenTuyen: r.route_ends!.routes!.ten_tuyen,
      lctTime: r.lct_time,
    }));

  const dedupedRows = dedupeScheduleRowsByVehicle(scheduleRows);

  if (mode === 'lct') {
    return NextResponse.json({ date, mode, vehicles: sortByLctTimeAscending(dedupedRows) });
  }

  return NextResponse.json({ date, mode, routes: groupByRouteAndDepot(dedupedRows) });
}

