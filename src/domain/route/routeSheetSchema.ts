import { z } from 'zod';

/**
 * QUY TẮC NGHIỆP VỤ QUAN TRỌNG (đã xác nhận với người dùng):
 * - Mỗi Tuyến được nhận diện DUY NHẤT bằng MST.
 * - Thông thường 1 Tuyến có 2 ĐẦU BẾN => 2 dòng Sheet cùng chung 1 MST,
 *   khác nhau ở "Điểm đầu" (và các field đặc thù theo đầu bến: Số lượng xe,
 *   Trạm sạc, Bãi đậu đêm, Km huy động...).
 * - Một số tuyến ĐẶC BIỆT (vd tuyến 159 - Metro) chỉ có 1 đầu bến => 1 dòng.
 * - Các field sau đây là "field chung của cả Tuyến" - phải GIỐNG NHAU giữa
 *   các dòng cùng MST: TUYẾN, Tình trạng, Cự ly, Chuyến, Chuyến đầu, Chuyến cuối,
 *   Time chuyến, Hiện tại, Chuyển đổi.
 * - Các field sau là "field riêng của từng đầu bến" - ĐƯỢC PHÉP khác nhau
 *   giữa 2 dòng cùng MST: Điểm đầu, Số lượng xe, Trạm sạc, Km huy động...,
 *   Bãi đậu đêm hiện hữu/thay đổi, Số lái xe dễ di dời.
 */

export const routeSheetRowSchema = z.object({
  // --- Field CHUNG của cả Tuyến ---
  'TUYẾN': z.string().trim().min(1, 'Tên tuyến không được để trống'),
  'MST': z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  'Tình trạng': z.string().trim().min(1, 'Thiếu tình trạng (Hoạt động/Chưa HĐ)'),
  'Cự ly': z.coerce.number().positive('Cự ly phải là số dương'),
  'Chuyến': z.coerce.number().int().nonnegative(),
  'Chuyến đầu': z.union([z.string(), z.number()]).optional(),
  'Chuyến cuối': z.union([z.string(), z.number()]).optional(),
  'Time chuyến': z.union([z.string(), z.number()]).optional(),
  'Hiện tại': z.string().trim().optional(),
  'Chuyển đổi': z.string().trim().optional(),

  // --- Field RIÊNG của từng đầu bến ---
  'Điểm đầu': z.string().trim().min(1, 'Thiếu điểm đầu'),
  'Số lượng xe': z.coerce.number().int().positive('Số lượng xe phải > 0'),
  'Trạm sạc': z.string().trim().optional(),
  'Km huy động từ đầu bến về trạm sạc': z.coerce.number().nonnegative().optional(),
  'Bãi đậu đêm hiện hữu': z.string().trim().optional(),
  'Bãi đậu đêm thay đổi': z.string().trim().optional(),
  'Km huy động từ trạm sạc về bãi đậu đêm': z.coerce.number().nonnegative().optional(),
  'Số lái xe dễ di dời': z.coerce.number().nonnegative().optional(),
});

export type RouteSheetRow = z.infer<typeof routeSheetRowSchema>;

/** Danh sách field CHUNG - dùng để kiểm tra đối chiếu giữa các dòng cùng MST */
export const SHARED_FIELDS = [
  'TUYẾN',
  'Tình trạng',
  'Cự ly',
  'Chuyến',
  'Chuyến đầu',
  'Chuyến cuối',
  'Time chuyến',
  'Hiện tại',
  'Chuyển đổi',
] as const satisfies readonly (keyof RouteSheetRow)[];

/** 1 dòng sẵn sàng insert vào bảng `routes` (mỗi MST chỉ 1 dòng) */
export interface RouteDbRow {
  mst: string;
  ten_tuyen: string;
  tinh_trang: string;
  cu_ly: number;
  so_chuyen: number;
  chuyen_dau?: string | number;
  chuyen_cuoi?: string | number;
  time_chuyen?: string | number;
  hien_tai?: string;
  chuyen_doi?: string;
}

/** 1 dòng sẵn sàng insert vào bảng `route_ends` (1-2 dòng cho mỗi Tuyến) */
export interface RouteEndDbRow {
  mst: string; // dùng tạm để nối route_id sau khi insert routes xong
  diem_dau: string;
  so_luong_xe: number;
  tram_sac?: string;
  km_dau_ben_tram_sac?: number;
  bai_dem_hien_huu?: string;
  bai_dem_thay_doi?: string;
  km_tram_sac_bai_dem?: number;
  so_lai_xe_de_di_doi?: number;
}

