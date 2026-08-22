import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

export async function GET() {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Mã tuyến', 'Tên tuyến', 'Đầu bến', 'Bãi đậu đêm', 'Trạm sạc', 'Số xe PA', 'Thời gian huy động (phút)', 'Buffer (phút)', 'Ghi chú'],
    ['89', 'Tuyến 89', 'ĐH Nông Lâm', 'Bến xe buýt Văn Thánh', 'Trạm sạc Khang Việt', 7, 45, 10, ''],
    ['89', 'Tuyến 89', 'Bến tàu Hiệp Bình Chánh', 'Bến xe buýt Văn Thánh', 'Trạm sạc Quang Thuận', 6, 35, 10, ''],
  ]);
  sheet['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 30 }, { wch: 30 }, { wch: 28 }, { wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(book, sheet, 'PA đậu đêm');
  return new NextResponse(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="mau-pa-dau-dem-co-dinh.xlsx"' } });
}
