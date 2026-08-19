import { NextResponse } from 'next/server';

export async function GET() {
  const body = '\uFEFFMã tuyến,Tên tuyến,Đầu bến,Bãi đậu đêm,Trạm sạc,Số xe PA,Thời gian huy động (phút),Buffer (phút),Ghi chú\r\n89,Tuyến 89,ĐH Nông Lâm,Bến xe buýt Văn Thánh,Trạm sạc Khang Việt,7,45,10,\r\n89,Tuyến 89,Bến tàu Hiệp Bình Chánh,Bến xe buýt Văn Thánh,Trạm sạc Quang Thuận,6,35,10,';
  return new NextResponse(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="mau-pa-dau-dem-co-dinh.csv"' } });
}
