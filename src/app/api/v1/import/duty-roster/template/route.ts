import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getCurrentUserContext } from '@/infrastructure/auth/getCurrentUserContext';
import { canPerform } from '@/shared/permissions/permissionMatrix';

export const runtime = 'nodejs';
const leftHeaders = ['Tài', 'GIỜ XB', 'GIỜ VB', 'BSX', 'HỌ TÊN LÁI XE', 'MSNV', 'SĐT', 'HỌ TÊN TV', 'MSNV', 'SĐT'];
const rightHeaders = ['Tài', 'GIỜ XB', 'GIỜ VB', 'BSX', 'HỌ TÊN LÁI XE', 'MSNV', 'SĐT', 'HỌ TÊN TV', 'MSNV', 'SĐT'];

export async function GET() {
  const actor = await getCurrentUserContext();
  if (!canPerform(actor.role, 'import_bang_tuyen_sheet')) return NextResponse.json({ error: { message: 'Chỉ admin hoặc điều độ được tải mẫu.' } }, { status: 403 });
  const rows: (string | number)[][] = [
    ['TUYẾN BUÝT CÓ TRỢ GIÁ SỐ 151 – Bến xe A - Bến xe B', '', '', '', '', '', '', '', '', '', '', 'NGÀY DD/MM/YYYY'],
    ['BẾN XE A - BẾN XE B', '', '', '', '', '', '', '', '', '', 'STT', 'BẾN XE B - BẾN XE A'],
    [...leftHeaders, 'STT', ...rightHeaders],
    ...Array.from({ length: 80 }, (_, index) => [index + 1, '', '', '', '', '', '', '', '', '', '', index + 1, '', '', '', '', '', '', '', '', '']),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!merges'] = [XLSX.utils.decode_range('A1:K1'), XLSX.utils.decode_range('L1:U1'), XLSX.utils.decode_range('A2:J2'), XLSX.utils.decode_range('L2:U2')];
  sheet['!cols'] = [{ wch: 8 }, { wch: 11 }, { wch: 11 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 11 }, { wch: 11 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 14 }];
  const guide = XLSX.utils.aoa_to_sheet([['HƯỚNG DẪN'], ['Giữ nguyên form', 'Có thể giữ toàn bộ cột lái xe, tiếp viên, MSNV và SĐT như biểu mẫu chuẩn.'], ['Hệ thống đọc', 'Tài/STT, GIỜ XB và BSX tại từng đầu bến.'], ['Mã tuyến', 'Lấy từ tên sheet, tên file hoặc tiêu đề tuyến.'], ['Kiểm tra', 'Tên đầu bến phải khớp PA đậu đêm; BSX chưa có sẽ yêu cầu điều độ xác nhận loại xe trước khi lưu.']]);
  guide['!cols'] = [{ wch: 22 }, { wch: 90 }];
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, '151'); XLSX.utils.book_append_sheet(book, guide, 'Hướng dẫn');
  return new NextResponse(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="mau-bang-tai-tieu-chuan.xlsx"' } });
}
