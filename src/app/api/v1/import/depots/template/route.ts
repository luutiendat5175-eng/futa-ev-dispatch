import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

export async function GET() {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([['Tên bãi', 'X', 'Y', 'Địa chỉ'], ['Bến xe mẫu', 10.775, 106.7, 'TP.HCM']]);
  sheet['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(book, sheet, 'Bãi đậu');
  return new NextResponse(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="mau-import-bai-dau.xlsx"' } });
}
