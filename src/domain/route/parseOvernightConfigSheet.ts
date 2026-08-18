import * as XLSX from 'xlsx';
import { readWorkbookForImport } from '@/shared/spreadsheets/readWorkbook';

export type OvernightConfigRow = { sourceRow: number; routeCode: string; routeName: string; routeEndName: string; routeEndKey: string; depotName: string; stationName: string; plannedVehicleCount: number; mobilizationMinutes: number; bufferMinutes: number; note: string | null };
export type OvernightConfigParseResult = { rows: OvernightConfigRow[]; errors: string[] };
const asText = (value: unknown) => String(value ?? '').trim();
const asNumber = (value: unknown) => Number(asText(value).replace(',', '.'));

/** Reads the fixed PA CSV/XLSX. For a circular route, repeated display names
 * are retained and numbered A/B internally according to their row order. */
export function parseOvernightConfigSheet(buffer: Buffer, fileName = ''): OvernightConfigParseResult {
  const workbook = readWorkbookForImport(buffer, fileName);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: false });
  const rows: OvernightConfigRow[] = []; const errors: string[] = []; const occurrences = new Map<string, number>();
  matrix.slice(1).forEach((cells, index) => {
    const row = cells as unknown[]; const routeCode = asText(row[0]); if (!routeCode) return;
    const routeName = asText(row[1]) || `Tuyến ${routeCode}`; const routeEndName = asText(row[2]); const depotName = asText(row[3]); const stationName = asText(row[4]);
    const plannedVehicleCount = asNumber(row[5]); const mobilizationMinutes = asNumber(row[6]); const bufferCell = asText(row[7]); const bufferMinutes = bufferCell ? asNumber(bufferCell) : 10; const note = asText(row[8]) || null;
    if (!routeEndName || !depotName || !stationName || !Number.isInteger(plannedVehicleCount) || plannedVehicleCount < 0 || !Number.isFinite(mobilizationMinutes) || mobilizationMinutes < 0 || !Number.isFinite(bufferMinutes) || bufferMinutes < 0) {
      errors.push(`Dòng ${index + 2}: cần đủ Đầu bến, Bãi đậu đêm, Trạm sạc, Số xe PA và thời gian huy động hợp lệ.`); return;
    }
    const occurrenceKey = `${routeCode}|${routeEndName}`.toLowerCase(); const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1; occurrences.set(occurrenceKey, occurrence);
    rows.push({ sourceRow: index + 2, routeCode, routeName, routeEndName, routeEndKey: occurrence === 1 ? routeEndName : `${routeEndName}__${String.fromCharCode(64 + occurrence)}`, depotName, stationName, plannedVehicleCount, mobilizationMinutes, bufferMinutes, note });
  });
  for (const [key, count] of occurrences) {
    if (count > 2) {
      const [routeCode, routeEndName] = key.split('|');
      errors.push(`Tuyến ${routeCode}, đầu bến “${routeEndName}” xuất hiện ${count} lần. PA chỉ cho phép tối đa 2 đầu bến; hãy xoá dòng trùng trước khi import.`);
      continue;
    }
    if (count < 2) continue;
    let ordinal = 0;
    for (const row of rows) {
      if (`${row.routeCode}|${row.routeEndName}`.toLowerCase() !== key) continue;
      ordinal += 1;
      row.routeEndKey = `${row.routeEndName}__${String.fromCharCode(64 + ordinal)}`;
    }
  }
  return { rows: errors.length ? [] : rows, errors };
}
