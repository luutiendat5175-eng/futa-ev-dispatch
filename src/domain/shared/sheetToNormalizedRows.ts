import * as XLSX from 'xlsx';

/**
 * LỖI THỰC TẾ ĐÃ GẶP: Excel cho phép bật "Wrap Text" trên ô tiêu đề, khiến
 * tên cột lưu trong file có ký tự xuống dòng bên trong, vd:
 *   "Số lượng\nxe"  thay vì  "Số lượng xe"
 * Nếu so khớp tên cột chính xác từng ký tự (kiểu XLSX.utils.sheet_to_json mặc
 * định dùng thẳng text tiêu đề làm key), MỌI dòng sẽ báo lỗi "expected number,
 * received NaN" dù dữ liệu hoàn toàn đúng - vì code tìm sai tên field.
 *
 * Chuẩn hoá: gộp mọi khoảng trắng liên tiếp (bao gồm \n, \r, \t, nhiều dấu cách)
 * thành đúng 1 dấu cách, rồi trim 2 đầu.
 */
export function normalizeHeaderText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Đọc 1 worksheet thành mảng object, với KEY đã chuẩn hoá theo normalizeHeaderText().
 * Dùng hàm này thay cho XLSX.utils.sheet_to_json(ws, {defval}) trực tiếp ở MỌI
 * module import, để tránh lặp lại lỗi "tên cột có \n" ở nơi khác.
 */
export function sheetToNormalizedRows(worksheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: undefined });
  if (aoa.length === 0) return [];

  const headers = (aoa[0] as unknown[]).map(normalizeHeaderText);

  return aoa.slice(1).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, colIndex) => {
      obj[header] = (row as unknown[])[colIndex];
    });
    return obj;
  });
}

