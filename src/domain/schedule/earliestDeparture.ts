import type { TimeOfDay } from '../task/lctStrategy';

/**
 * QUY TẮC NGHIỆP VỤ QUAN TRỌNG (đã xác nhận với người dùng):
 * - 1 Tuyến có nhiều xe, chia cho 2 đầu bến KHÔNG đều nhau.
 *   Ví dụ thật: Tuyến 09 (Hưng Long - Chợ Lớn) có 20 xe:
 *     Đầu bến Hưng Long: 19 xe | Đầu bến Chợ Lớn: 1 xe.
 * - Mỗi xe chạy KHỨ HỒI suốt ngày (nhiều "Tài"/chuyến), nên CÙNG 1 BIỂN SỐ
 *   sẽ xuất hiện NHIỀU DÒNG trong Bảng tài của cùng 1 ngày.
 * - Khi tính LCT, KHÔNG được lấy bừa 1 dòng bất kỳ của xe đó - PHẢI lấy
 *   dòng có "Giờ xuất bến" SỚM NHẤT tương ứng với đầu bến của xe đó.
 *   (Đây là mốc "Giờ lên tài" dùng làm input cho công thức LCT.)
 */

export interface TripRow {
  bienSo: string;
  /** id của route_ends - đầu bến cụ thể mà xe này thuộc về */
  routeEndId: string;
  gioXB: TimeOfDay;
  soTai: number;
}

export interface EarliestDepartureByVehicle {
  bienSo: string;
  routeEndId: string;
  /** Giờ xuất bến sớm nhất trong ngày của xe này tại đầu bến này - dùng làm "Giờ lên tài" cho LCT */
  gioXBSomNhat: TimeOfDay;
  /** Số Tài tương ứng với dòng sớm nhất - giữ lại để truy vết/đối soát */
  soTaiSomNhat: number;
}

function toMinutes(t: TimeOfDay): number {
  return t.hour * 60 + t.minute;
}

/**
 * Gộp danh sách chuyến (Bảng tài) theo (Biển số + Đầu bến), lấy giờ xuất bến SỚM NHẤT
 * mỗi nhóm. Đây là bước BẮT BUỘC phải chạy TRƯỚC khi gọi LctStrategy, vì 1 xe
 * chạy khứ hồi sẽ có nhiều dòng trong Bảng tài của cùng 1 ngày.
 */
export function computeEarliestDeparturePerVehicle(
  trips: TripRow[],
): EarliestDepartureByVehicle[] {
  const grouped = new Map<string, EarliestDepartureByVehicle>();

  for (const trip of trips) {
    // A bus may appear in both route-end blocks in the duty roster. It still
    // needs one charging task only: use the route end of its first departure.
    const key = trip.bienSo;
    const existing = grouped.get(key);

    if (!existing || toMinutes(trip.gioXB) < toMinutes(existing.gioXBSomNhat)) {
      grouped.set(key, {
        bienSo: trip.bienSo,
        routeEndId: trip.routeEndId,
        gioXBSomNhat: trip.gioXB,
        soTaiSomNhat: trip.soTai,
      });
    }
  }

  return Array.from(grouped.values());
}
