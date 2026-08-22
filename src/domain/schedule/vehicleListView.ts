/**
 * Domain layer cho "Danh sách xe" (2 chế độ theo yêu cầu thiết kế):
 *   Chế độ 1: Theo LCT - sắp xếp tăng dần.
 *   Chế độ 2: Theo Bảng tài - group theo Tuyến -> Đầu A / Đầu B.
 *
 * daily_schedule lưu 1 dòng/chuyến (1 xe có thể nhiều dòng/ngày do chạy khứ hồi -
 * xem quy tắc đã chốt ở earliestDeparture.ts). Danh sách xe chỉ cần HIỂN THỊ
 * 1 dòng/xe/ngày, nên phải gộp (dedupe) trước khi sort/group.
 */

export interface ScheduleRow {
  vehicleId: string;
  bienSo: string;
  routeEndId: string;
  diemDau: string;
  mst: string;
  tenTuyen: string;
  /** "HH:mm" hoặc null nếu chưa tính được LCT (thiếu cấu hình) */
  lctTime: string | null;
}

/**
 * Gộp về 1 dòng/xe/ngày (loại bỏ trùng do 1 xe có nhiều chuyến trong daily_schedule).
 * Giữ lại dòng ĐẦU TIÊN gặp cho mỗi vehicleId - vì lct_time đã được tính THỐNG NHẤT
 * cho mọi dòng của cùng 1 xe/ngày ở bước import (xem computeLctForDailySchedule),
 * nên dòng nào cũng cho cùng 1 kết quả, không quan trọng lấy dòng nào.
 */
export function dedupeScheduleRowsByVehicle(rows: ScheduleRow[]): ScheduleRow[] {
  const seen = new Map<string, ScheduleRow>();
  for (const row of rows) {
    if (!seen.has(row.vehicleId)) {
      seen.set(row.vehicleId, row);
    }
  }
  return Array.from(seen.values());
}

function parseHHmmToMinutes(hhmm: string | null): number {
  if (!hhmm) return Number.POSITIVE_INFINITY; // xe chưa có LCT -> xếp cuối danh sách
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Chế độ 1: sắp xếp danh sách xe theo LCT tăng dần (đúng yêu cầu thiết kế) */
export function sortByLctTimeAscending(rows: ScheduleRow[]): ScheduleRow[] {
  return [...rows].sort((a, b) => parseHHmmToMinutes(a.lctTime) - parseHHmmToMinutes(b.lctTime));
}

export interface RouteEndGroup {
  diemDau: string;
  vehicles: ScheduleRow[];
}

export interface RouteGroup {
  mst: string;
  tenTuyen: string;
  dauBens: RouteEndGroup[];
}

/**
 * Chế độ 2: group theo Tuyến -> Đầu bến (Đầu A / Đầu B), giữ nguyên thứ tự
 * đầu bến xuất hiện đầu tiên trong dữ liệu. Dùng để kiểm tra "cân bằng số xe
 * giữa các đầu bến" như yêu cầu thiết kế.
 */
export function groupByRouteAndDepot(rows: ScheduleRow[]): RouteGroup[] {
  const routeGroups = new Map<string, RouteGroup>();

  for (const row of rows) {
    let routeGroup = routeGroups.get(row.mst);
    if (!routeGroup) {
      routeGroup = { mst: row.mst, tenTuyen: row.tenTuyen, dauBens: [] };
      routeGroups.set(row.mst, routeGroup);
    }

    let depotGroup = routeGroup.dauBens.find((d) => d.diemDau === row.diemDau);
    if (!depotGroup) {
      depotGroup = { diemDau: row.diemDau, vehicles: [] };
      routeGroup.dauBens.push(depotGroup);
    }
    depotGroup.vehicles.push(row);
  }

  return Array.from(routeGroups.values());
}

