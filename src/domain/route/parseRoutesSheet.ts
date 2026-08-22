import * as XLSX from 'xlsx';
import {
  routeSheetRowSchema,
  SHARED_FIELDS,
  type RouteSheetRow,
  type RouteDbRow,
  type RouteEndDbRow,
} from './routeSheetSchema';

export interface ImportRowError {
  /** Số dòng THẬT trong Excel (hoặc danh sách nhiều dòng nếu lỗi thuộc về cả nhóm MST) */
  row: number | number[];
  errors: string[];
}

export interface ParseRoutesSheetResult {
  validRoutes: RouteDbRow[];
  validRouteEnds: RouteEndDbRow[];
  errors: ImportRowError[];
}

interface RawRowWithMeta {
  excelRowNumber: number;
  data: RouteSheetRow;
}

/**
 * Đọc buffer .xlsx, validate từng dòng, sau đó GỘP các dòng theo MST thành
 * (1 Tuyến) + (1-2 Đầu bến) theo đúng quy tắc nghiệp vụ:
 *   - MST xuất hiện 1 lần  -> tuyến đặc biệt, chỉ 1 đầu bến (vd tuyến 159)
 *   - MST xuất hiện 2 lần  -> tuyến thường, đủ 2 đầu bến (Đầu A / Đầu B)
 *   - MST xuất hiện > 2 lần -> LỖI, dữ liệu bất thường, phải chặn
 *   - 2 dòng cùng MST có field CHUNG (Cự ly, Chuyến, giờ chạy...) khác nhau -> LỖI
 *   - 2 dòng cùng MST có cùng "Điểm đầu" (trùng lặp đầu bến) -> LỖI
 *
 * Nguyên tắc all-or-nothing: có bất kỳ lỗi nào (dù ở 1 dòng hay 1 nhóm MST)
 * => không trả về dòng insert nào, để tầng gọi không insert phần nào cả.
 */
export function parseRoutesSheet(buffer: Buffer): ParseRoutesSheetResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: undefined,
  });

  const errors: ImportRowError[] = [];
  const parsedRows: RawRowWithMeta[] = [];

  // Bước 1: validate từng dòng độc lập (đúng kiểu dữ liệu, đủ field bắt buộc)
  rawRows.forEach((rawRow, index) => {
    const excelRowNumber = index + 2; // +2: bù dòng header + index bắt đầu từ 0
    const result = routeSheetRowSchema.safeParse(rawRow);

    if (!result.success) {
      const rowErrors = result.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      errors.push({ row: excelRowNumber, errors: rowErrors });
      return;
    }
    parsedRows.push({ excelRowNumber, data: result.data });
  });

  // Nếu đã lỗi ở tầng từng dòng, dừng luôn, không gộp nhóm nữa (tránh lỗi domino gây nhiễu)
  if (errors.length > 0) {
    return { validRoutes: [], validRouteEnds: [], errors };
  }

  // Bước 2: gộp nhóm theo MST
  const groupsByMst = new Map<string, RawRowWithMeta[]>();
  for (const row of parsedRows) {
    const mst = row.data['MST'];
    const group = groupsByMst.get(mst) ?? [];
    group.push(row);
    groupsByMst.set(mst, group);
  }

  const validRoutes: RouteDbRow[] = [];
  const validRouteEnds: RouteEndDbRow[] = [];

  for (const [mst, group] of groupsByMst.entries()) {
    const rowNumbers = group.map((r) => r.excelRowNumber);

    // Quy tắc: tối đa 2 đầu bến cho 1 tuyến
    if (group.length > 2) {
      errors.push({
        row: rowNumbers,
        errors: [
          `MST "${mst}" xuất hiện ${group.length} dòng - 1 Tuyến chỉ được tối đa 2 đầu bến, kiểm tra lại dữ liệu`,
        ],
      });
      continue;
    }

    // Quy tắc: nếu có 2 dòng, "Điểm đầu" phải khác nhau (không trùng đầu bến)
    if (group.length === 2) {
      const diemDauSet = new Set(group.map((r) => r.data['Điểm đầu']));
      if (diemDauSet.size < 2) {
        errors.push({
          row: rowNumbers,
          errors: [`MST "${mst}" có 2 dòng nhưng trùng "Điểm đầu" - phải là 2 đầu bến khác nhau`],
        });
        continue;
      }

      // Quy tắc: các field CHUNG của tuyến phải khớp nhau giữa 2 đầu bến
      const [rowA, rowB] = group;
      const mismatchedFields = SHARED_FIELDS.filter(
        (field) => rowA.data[field] !== rowB.data[field],
      );
      if (mismatchedFields.length > 0) {
        errors.push({
          row: rowNumbers,
          errors: [
            `MST "${mst}" có dữ liệu không khớp giữa 2 đầu bến ở cột: ${mismatchedFields.join(', ')}`,
          ],
        });
        continue;
      }
    }

    // Qua hết validate -> tạo 1 Tuyến + 1-2 Đầu bến
    const base = group[0].data;
    validRoutes.push({
      mst,
      ten_tuyen: base['TUYẾN'],
      tinh_trang: base['Tình trạng'],
      cu_ly: base['Cự ly'],
      so_chuyen: base['Chuyến'],
      chuyen_dau: base['Chuyến đầu'],
      chuyen_cuoi: base['Chuyến cuối'],
      time_chuyen: base['Time chuyến'],
      hien_tai: base['Hiện tại'],
      chuyen_doi: base['Chuyển đổi'],
    });

    for (const row of group) {
      validRouteEnds.push({
        mst,
        diem_dau: row.data['Điểm đầu'],
        so_luong_xe: row.data['Số lượng xe'],
        tram_sac: row.data['Trạm sạc'],
        km_dau_ben_tram_sac: row.data['Km huy động từ đầu bến về trạm sạc'],
        bai_dem_hien_huu: row.data['Bãi đậu đêm hiện hữu'],
        bai_dem_thay_doi: row.data['Bãi đậu đêm thay đổi'],
        km_tram_sac_bai_dem: row.data['Km huy động từ trạm sạc về bãi đậu đêm'],
        so_lai_xe_de_di_doi: row.data['Số lái xe dễ di dời'],
      });
    }
  }

  if (errors.length > 0) {
    return { validRoutes: [], validRouteEnds: [], errors };
  }

  return { validRoutes, validRouteEnds, errors: [] };
}

