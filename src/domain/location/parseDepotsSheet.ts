import * as XLSX from 'xlsx';
import { readWorkbookForImport } from '@/shared/spreadsheets/readWorkbook';

export interface DepotDbRow { name: string; x: number; y: number; address?: string; }
export interface ImportRowError { row: number; errors: string[]; }
export interface ParseDepotsSheetResult { validRows: DepotDbRow[]; errors: ImportRowError[]; }

/** Supports Excel, normal CSV and legacy CSV where the full comma row was quoted. */
export function parseDepotsSheet(buffer: Buffer, fileName = ''): ParseDepotsSheetResult {
  const workbook = readWorkbookForImport(buffer, fileName); const sheet = workbook.Sheets[workbook.SheetNames[0]]; const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false }); const validRows: DepotDbRow[] = []; const errors: ImportRowError[] = [];
  matrix.slice(1).forEach((cells, index) => {
    let row = cells as unknown[]; if (row.length === 1 && String(row[0]).includes(',')) row = String(row[0]).split(',');
    const name = String(row[0] ?? '').trim(); const x = Number(String(row[1] ?? '').trim()); const y = Number(String(row[2] ?? '').trim()); const address = String(row[3] ?? '').trim();
    if (!name && !String(row[1] ?? '').trim() && !String(row[2] ?? '').trim()) return;
    if (!name || !Number.isFinite(x) || !Number.isFinite(y) || x < -90 || x > 90 || y < -180 || y > 180) { errors.push({ row: index + 2, errors: ['Cần Tên bãi, X (vĩ độ) và Y (kinh độ) hợp lệ.'] }); return; }
    validRows.push({ name, x, y, address: address || undefined });
  });
  return errors.length ? { validRows: [], errors } : { validRows, errors: [] };
}
