import type { DutyRosterTripRow } from './parseDutyRosterSheet';
import type { TripRow } from './earliestDeparture';

export interface MapTripsResult {
  mapped: TripRow[];
  /** Tên đầu bến xuất hiện trong Excel nhưng KHÔNG khớp route_ends nào trong DB */
  unmatchedDiemDau: string[];
}

/**
 * Chuyển danh sách chuyến đọc từ Excel (diemDau dạng TEXT) sang dạng dùng route_end_id (UUID)
 * để đưa vào computeLctForDailySchedule. Tách domain function này để test được logic mapping
 * mà không cần DB thật - tầng API route sẽ tự query route_ends theo mst rồi build Map truyền vào đây.
 *
 * Nếu có tên đầu bến trong Bảng tài không khớp bất kỳ route_end nào đã import từ Bảng Tuyến,
 * đây là dấu hiệu dữ liệu KHÔNG ĐỒNG BỘ giữa 2 nguồn (vd đầu bến bị đổi tên, hoặc chưa import Tuyến
 * trước khi import Bảng tài) - phải báo lỗi rõ ràng, không được âm thầm bỏ qua dòng đó.
 */
export function mapTripsToRouteEndIds(
  trips: DutyRosterTripRow[],
  diemDauToRouteEndId: Map<string, string>,
): MapTripsResult {
  const mapped: TripRow[] = [];
  const unmatchedSet = new Set<string>();

  for (const trip of trips) {
    const routeEndId = diemDauToRouteEndId.get(trip.diemDau.trim());
    if (!routeEndId) {
      unmatchedSet.add(trip.diemDau);
      continue;
    }
    const [hourStr, minuteStr] = trip.gioXB.split(':');
    mapped.push({
      bienSo: trip.bienSo,
      routeEndId,
      soTai: trip.soTai,
      gioXB: { hour: Number(hourStr) || 0, minute: Number(minuteStr) || 0 },
    });
  }

  return { mapped, unmatchedDiemDau: Array.from(unmatchedSet) };
}

