import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

export async function GET() {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([['Tên trạm', 'X', 'Y', 'Công suất'], ['Trạm sạc mẫu', 10.776, 106.701, 10]]);
  sheet['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(book, sheet, 'Trạm sạc');
  return new NextResponse(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="mau-import-tram-sac.xlsx"' } });
}
