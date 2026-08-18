import * as XLSX from 'xlsx';
import type { ImportRowError } from './parseDepotsSheet';
import { readWorkbookForImport } from '@/shared/spreadsheets/readWorkbook';

export interface StationDbRow {
  name: string;
  x: number;
  y: number;
  capacity?: number;
}

export interface ParseStationsSheetResult {
  validRows: StationDbRow[];
  errors: ImportRowError[];
}

export function parseStationsSheet(buffer: Buffer, fileName = ''): ParseStationsSheetResult {
  const workbook = readWorkbookForImport(buffer, fileName);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: false });

  const validRows: StationDbRow[] = [];
  const errors: ImportRowError[] = [];

  rawRows.slice(1).forEach((rawRow, index) => {
    const row = rawRow as unknown[];
    if (row.every((value) => String(value ?? '').trim() === '')) return;
    const excelRowNumber = index + 2;
    const name = String(row[0] ?? '').trim(); const x = Number(String(row[1] ?? '').trim()); const y = Number(String(row[2] ?? '').trim()); const capacityText = String(row[3] ?? '').trim(); const capacity = capacityText ? Number(capacityText) : undefined;
    if (!name || !Number.isFinite(x) || !Number.isFinite(y) || x < -90 || x > 90 || y < -180 || y > 180 || (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 0))) {
      errors.push({ row: excelRowNumber, errors: ['Cần Tên trạm, X (vĩ độ), Y (kinh độ) hợp lệ; Công suất là số nguyên không âm nếu có.'] });
      return;
    }
    validRows.push({ name, x, y, capacity });
  });

  if (errors.length > 0) {
    return { validRows: [], errors };
  }
  return { validRows, errors: [] };
}
