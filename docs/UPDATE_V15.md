# Cập nhật v15: chốt ngày vận doanh và phân công nền

1. Trong Supabase SQL Editor, chạy theo thứ tự ba file: `supabase/migrations/202608150015_daily_isolation_base_assignments_announcements.sql`, `supabase/migrations/202608150016_expire_prior_dispatch_tasks.sql`, sau đó `supabase/migrations/202608160017_route_scoped_roster_import.sql`.
2. Thay mã nguồn ứng dụng bằng thư mục phát hành v15; giữ lại file `.env.local` của bạn.
3. Chạy `npm install`, rồi `npm run dev`.
4. Import lại bảng tài của ngày đang kiểm tra. Hệ thống chỉ thay thế task của chính tuyến trong file, giữ nguyên toàn bộ tuyến khác của cùng ngày; do đó nhiều điều độ có thể import các tuyến khác nhau đồng thời. Mỗi xe tạo đúng **một task** theo giờ xuất bến sớm nhất.

Khi lần đầu tạo bảng tài cho một ngày mới, các task điều chuyển chưa hoàn thành của ngày trước được chuyển thành `Quá hạn`. Ảnh và lịch sử vẫn còn trong hệ thống; dashboard chỉ hiển thị task của ngày mới.

Phân công trạm nay là dữ liệu nền. Bản migration tự sao chép phân công gần nhất hiện có sang bảng mới; sau đó thay đổi ở Quản trị người dùng có hiệu lực cho các ngày tiếp theo, không cần nhập lại mỗi ngày.
