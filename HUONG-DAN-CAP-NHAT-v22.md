# Cập nhật v22 — Theo dõi nhân viên và quá hạn

## 1. Chạy migration bắt buộc

Mở **Supabase → SQL Editor**, tạo truy vấn mới, dán toàn bộ nội dung file:

`supabase/migrations/202608170020_employee_location_and_time_rules.sql`

Nhấn **Run**. Migration này không xoá task, lịch sử hoặc ảnh. Nó chỉ thêm cấu hình thời gian, bảng cảnh báo và quy tắc không cho một lái xe nhận hai xe đang hoạt động cùng lúc.

## 2. Khởi động ứng dụng

Trong thư mục dự án, giữ lại `.env.local` của bạn rồi chạy:

```powershell
npm install
npm run dev
```

Mở `http://localhost:3000` và đăng nhập admin.

## 3. Cấu hình thời gian

Vào **Thời gian điều phối** ở sidebar. Với mỗi trạm, đặt:

- Bãi → trạm: từ lúc *Nhận xe* đến *Giao trạm sạc*.
- Chờ tối đa tại trạm: từ *Giao trạm sạc* đến *Nhận trạm sạc*.
- Trạm → bãi: từ *Nhận trạm sạc* đến *Trả xe*.
- Chờ tối đa tại bãi và khoảng cách nhận xe: thời gian nghỉ trước task mới.

Để cấu hình chung, chọn **Tất cả bãi của trạm**. Nếu một bãi cần thời gian riêng, chọn bãi đó và lưu; quy tắc cặp bãi–trạm sẽ được ưu tiên.

## Kết quả trên bản đồ

- Một tuyến đi hoặc về hiển thị toàn bộ nhân viên đang trên tuyến đó.
- Danh sách hiển thị mới nhất ở trên; thời gian quá hạn có màu đỏ.
- Mỗi người chỉ xuất hiện ở một vị trí theo thao tác gần nhất: chiều đi, trạm, chiều về hoặc bãi.
- Cảnh báo được tự tạo khi dashboard kiểm tra dữ liệu và tự kết thúc ngay khi có thao tác tiếp theo.
