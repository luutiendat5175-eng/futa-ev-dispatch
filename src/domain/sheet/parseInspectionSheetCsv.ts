/**
 * Sheet mẫu để tạo Task kiểm tra hàng loạt, cột: Biển số | Mô tả | Ngày (tuỳ chọn).
 * Cách chuẩn bị: Google Sheet -> File -> Chia sẻ -> Xuất bản lên web -> chọn
 * định dạng CSV -> copy URL dán vào hệ thống.
 *
 * LƯU Ý QUAN TRỌNG (giữ đúng nguyên tắc thiết kế gốc "Không đọc trực tiếp Google
 * Sheet trong quá trình vận hành"): tính năng này CHỈ đồng bộ khi Điều độ/Quản lý
 * CHỦ ĐỘNG bấm nút "Đồng bộ" - không tự động polling liên tục đọc Sheet, khác
 * hẳn với việc "đọc trực tiếp Sheet trong vận hành" mà thiết kế gốc cấm.
 */

export interface InspectionSheetRow {
  bienSo: string;
  moTa: string;
  ngay?: string;
}

export interface ParseInspectionSheetResult {
  validRows: InspectionSheetRow[];
  errors: { row: number; message: string }[];
}

/** Parser CSV tối giản, xử lý đúng field có dấu phẩy bên trong dấu ngoặc kép (chuẩn RFC 4180 cơ bản) */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // bỏ qua dấu " thứ 2 (escape)
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseInspectionSheetCsv(csvText: string): ParseInspectionSheetResult {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { validRows: [], errors: [{ row: 0, message: 'File CSV rỗng' }] };
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const bienSoIdx = header.indexOf('Biển số');
  const moTaIdx = header.indexOf('Mô tả');
  const ngayIdx = header.indexOf('Ngày');

  if (bienSoIdx === -1 || moTaIdx === -1) {
    return {
      validRows: [],
      errors: [{ row: 1, message: 'Thiếu cột bắt buộc "Biển số" hoặc "Mô tả" ở dòng tiêu đề' }],
    };
  }

  const validRows: InspectionSheetRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const bienSo = cells[bienSoIdx]?.trim();
    const moTa = cells[moTaIdx]?.trim();
    const ngay = ngayIdx !== -1 ? cells[ngayIdx]?.trim() : undefined;

    if (!bienSo) {
      errors.push({ row: i + 1, message: 'Thiếu Biển số' });
      continue;
    }
    if (!moTa) {
      errors.push({ row: i + 1, message: 'Thiếu Mô tả' });
      continue;
    }

    validRows.push({ bienSo, moTa, ngay: ngay || undefined });
  }

  return { validRows, errors };
}

