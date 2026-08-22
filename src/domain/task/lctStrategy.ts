/**
 * Domain layer - KHÔNG phụ thuộc Next.js / Supabase / bất kỳ framework nào.
 * Đây là nơi duy nhất chứa "luật nghiệp vụ" tính LCT, để dễ unit test
 * và dễ thay thế bằng chiến lược khác (SOC, khoảng cách, AI...) sau này.
 *
 * Công thức đã chốt với nghiệp vụ:
 *   LCT = Giờ lên tài (hôm sau) - TG sạc - TG huy động - buffer (mặc định 10 phút)
 *
 * LCT là một MỐC GIỜ (deadline), được biểu diễn dưới dạng "số phút kể từ 00:00"
 * để tránh lỗi tính toán qua nửa đêm.
 */

export interface TimeOfDay {
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
}

export interface LctInput {
  /** Giờ lên tài của ngày hôm sau, lấy trực tiếp từ Bảng tài (input mỗi ngày) */
  gioLenTai: TimeOfDay;
  /** Thời gian sạc (phút) - tham số theo DÒNG XE, do Quản lý cấu hình */
  tgSacMinutes: number;
  /** Thời gian huy động (phút) - tham số theo TUYẾN, do Quản lý cấu hình */
  tgHuyDongMinutes: number;
  /** Phút trừ hao dự phòng - tham số hệ thống, mặc định 10 */
  bufferMinutes?: number;
}

export interface LctResult {
  /** Mốc giờ LCT, dạng số phút kể từ 00:00 của "ngày tính toán" (có thể âm nếu lùi qua hôm trước) */
  totalMinutesFromMidnight: number;
  /** Mốc giờ LCT hiển thị dạng HH:mm, đã chuẩn hoá về khung 0-23h */
  display: string;
  /** true nếu deadline bị lùi sang ngày hôm trước (cảnh báo nghiệp vụ: không đủ thời gian) */
  rolledBackToPreviousDay: boolean;
}

export const DEFAULT_LCT_BUFFER_MINUTES = 10;

function timeOfDayToMinutes(t: TimeOfDay): number {
  return t.hour * 60 + t.minute;
}

function minutesToDisplay(totalMinutes: number): string {
  // Chuẩn hoá về khung 0..1439 để hiển thị HH:mm hợp lệ dù kết quả gốc âm hoặc > 1440
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = Math.floor(normalized / 60)
    .toString()
    .padStart(2, '0');
  const mm = (normalized % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * LctStrategy: interface chung cho mọi tiêu chí sắp xếp trong tương lai
 * (SocStrategy, DistanceStrategy, AiOptimizeStrategy...) — cho phép Strategy Pattern
 * mà không phải sửa code nơi gọi.
 */
export interface SortStrategy<TInput, TResult> {
  calculate(input: TInput): TResult;
}

export class LctStrategy implements SortStrategy<LctInput, LctResult> {
  calculate(input: LctInput): LctResult {
    const { gioLenTai, tgSacMinutes, tgHuyDongMinutes } = input;
    const buffer = input.bufferMinutes ?? DEFAULT_LCT_BUFFER_MINUTES;

    if (tgSacMinutes < 0 || tgHuyDongMinutes < 0 || buffer < 0) {
      throw new Error('LCT_INVALID_PARAM: các tham số thời gian không được âm');
    }

    const gioLenTaiMinutes = timeOfDayToMinutes(gioLenTai);
    const totalMinutesFromMidnight =
      gioLenTaiMinutes - tgSacMinutes - tgHuyDongMinutes - buffer;

    return {
      totalMinutesFromMidnight,
      display: minutesToDisplay(totalMinutesFromMidnight),
      rolledBackToPreviousDay: totalMinutesFromMidnight < 0,
    };
  }
}

/**
 * Helper dùng để SẮP XẾP danh sách xe theo LCT tăng dần (đúng yêu cầu nghiệp vụ).
 * Nhận vào danh sách đã có kết quả LCT, trả về thứ tự ưu tiên xử lý.
 */
export function sortByLctAscending<T extends { lct: LctResult }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => a.lct.totalMinutesFromMidnight - b.lct.totalMinutesFromMidnight,
  );
}

