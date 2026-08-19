# Thiết lập EV Dispatch

## 1. Supabase

1. Tạo một Supabase project.
2. Mở SQL Editor và chạy migration:
   theo thứ tự tên file: `202608120001_dispatch_core.sql` đến
   `202608120004_seed_confirmed_vehicle_charge_times.sql`.
3. Trong Authentication, tạo người dùng với email nội bộ:
   `<MSNV>@noibo.local`. PIN là mật khẩu Supabase của tài khoản đó.
4. Tạo hàng tương ứng trong `public.profiles`, với `id` bằng `auth.users.id`,
   `employee_code` là MSNV viết hoa và role thuộc: `admin`, `dieu_phoi`,
   `dieu_do`, `lai_xe`.
5. Nhập bãi, trạm và xe trước khi nhập kế hoạch ngày. Bucket `task-proof`
   được migration tạo ở chế độ private.
6. Bật Realtime cho các bảng `dispatch_tasks` và `task_events` trong
   Database > Replication.

## 2. Biến môi trường

Tạo `.env.local` từ mẫu sau. Không commit service role key.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

## 3. Kế hoạch ngày N+1

- Một ca bắt đầu lúc 18:00 ngày N và kết thúc lúc 06:00 ngày N+1.
- `daily_plans.service_date` là ngày N+1 — ngày hiển thị trên bảng tài.
- Quản lý nhập PA đậu đêm thành `plan_route_ends`: mỗi đầu bến một dòng,
  dùng **Bãi đậu đêm thay đổi** làm `overnight_depot_code` (không dùng tên đầu bến làm depot).
  Chỉ giữ: tuyến, đầu bến, bãi đậu đêm, trạm sạc, số xe PA, thời gian huy động,
  buffer và ghi chú. Các cột km chỉ là tham khảo và không được dùng tính LCT.
  Thời gian sạc cấu hình ở `vehicle_types` theo loại xe trong bảng XE.
  gắn bãi, trạm, thời gian sạc, thời gian huy động và khoảng cách mặc định.
- Import bảng tài thành `daily_vehicle_schedules`: chỉ giữ giờ xuất bến
  sớm nhất của từng xe tại đúng đầu bến.
- LCT = giờ lên tài − thời gian sạc − thời gian huy động − 10 phút.
- Gọi `select public.generate_lct_dispatch_tasks('<daily_plan_id>');` khi
  kế hoạch còn `draft`; task được tạo theo LCT tăng dần.
- Khi đã kiểm tra xong, đặt plan là `locked`. Chỉ admin được mở khóa,
  sửa hoặc đồng bộ lại; version cũ phải lưu vào `daily_plan_versions`.

Một lái xe được nhận nhiều task. Mỗi task được claim nguyên tử nên không thể
có hai người cùng nhận *một* task, nhưng một xe có thể do người A đi chiều đến
trạm và người B nhận/giao chiều về. Quản lý có thể sắp xếp một lái xe làm nhiều
chuyến theo tình hình thực tế.

## 4. Bằng chứng thao tác

API `POST /api/v1/tasks/:taskId/transition` chỉ nhận thao tác khi có:

- một ảnh JPEG/PNG/WebP tối đa 8 MB;
- latitude, longitude và độ chính xác GPS;
- người dùng đã nhận task hoặc là điều phối/admin.

Ảnh được lưu private theo đường dẫn `<profile-id>/<task-id>/...` trong
Supabase Storage. Metadata và event không được xóa.

## 5. Triển khai Vercel

1. Đẩy source lên GitHub, không đẩy `.env.local`.
2. Import repository trong Vercel.
3. Thêm ba biến môi trường ở trên vào Production/Preview.
4. Build command: `npm run build`.
5. Chỉ sau khi migration đã chạy và RLS đã được kiểm thử bằng từng role mới
   bật môi trường Production.
