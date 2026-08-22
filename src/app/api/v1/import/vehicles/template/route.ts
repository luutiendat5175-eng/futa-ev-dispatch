import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export async function GET() {
  const book = XLSX.utils.book_new(); const sheet = XLSX.utils.aoa_to_sheet([['Biển số', 'Loại xe'], ['50B-123.45', 'VINBUS']]);
  sheet['!cols'] = [{ wch: 20 }, { wch: 18 }]; XLSX.utils.book_append_sheet(book, sheet, 'Danh mục xe');
  return new NextResponse(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="mau-import-danh-muc-xe.xlsx"' } });
}
