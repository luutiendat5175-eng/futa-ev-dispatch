import { LctStrategy, type LctResult } from '../task/lctStrategy';
import { computeEarliestDeparturePerVehicle, type TripRow } from './earliestDeparture';

export interface VehicleLctParams {
  tgSacMinutes: number;
  tgHuyDongMinutes: number;
  bufferMinutes?: number;
}

export interface VehicleLctResult {
  bienSo: string;
  routeEndId: string;
  gioXBSomNhat: TripRow['gioXB'];
  lct: LctResult;
}

/**
 * Entry point CHÍNH THỨC để tính LCT cho danh sách xe trong 1 Bảng tài.
 *
 * QUAN TRỌNG: nhận "trips" là TOÀN BỘ các dòng trong Bảng tài của 1 ngày
 * (có thể nhiều dòng/xe do chạy khứ hồi) - hàm này TỰ ĐỘNG gộp về đúng
 * giờ xuất bến sớm nhất trước khi tính LCT, để tầng gọi (API, UI) không
 * bao giờ vô tình lấy nhầm dòng.
 *
 * @param trips Toàn bộ dòng Bảng tài trong ngày (đã join theo route_end)
 * @param paramsByRouteEndId Tham số LCT (TG sạc theo dòng xe, TG huy động theo đầu bến) - lấy theo routeEndId
 */
export function computeLctForDailySchedule(
  trips: TripRow[],
  paramsByRouteEndId: Map<string, VehicleLctParams>,
): VehicleLctResult[] {
  const earliestPerVehicle = computeEarliestDeparturePerVehicle(trips);
  const strategy = new LctStrategy();

  return earliestPerVehicle.map((v) => {
    const params = paramsByRouteEndId.get(v.routeEndId);
    if (!params) {
      throw new Error(
        `LCT_MISSING_CONFIG: chưa cấu hình TG sạc/TG huy động cho route_end "${v.routeEndId}"`,
      );
    }

    const lct = strategy.calculate({
      gioLenTai: v.gioXBSomNhat,
      tgSacMinutes: params.tgSacMinutes,
      tgHuyDongMinutes: params.tgHuyDongMinutes,
      bufferMinutes: params.bufferMinutes,
    });

    return {
      bienSo: v.bienSo,
      routeEndId: v.routeEndId,
      gioXBSomNhat: v.gioXBSomNhat,
      lct,
    };
  });
}

