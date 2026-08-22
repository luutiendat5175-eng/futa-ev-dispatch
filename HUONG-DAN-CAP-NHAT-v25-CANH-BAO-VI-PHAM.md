# Cập nhật v25 — Cảnh báo vi phạm theo trạm

## Phạm vi thử nghiệm

Chỉ Trạm sạc An Phú Đông được bật thử nghiệm.

| Cấu hình | Giá trị |
|---|---:|
| Bãi Quang Trung → Trạm An Phú Đông | 25 phút |
| Trạm An Phú Đông → Bãi Quang Trung | 30 phút |
| Chờ tối đa tại trạm | 30 phút |
| Khoảng cách tối thiểu hai lần nhận xe | 10 phút |
| 20:00–02:00 | Ưu tiên 1–70 |
| 02:00–03:00 | Ưu tiên 70–110 |
| Nhóm Zalo (nhãn cấu hình) | EV DISPATCH |

Task được xếp ưu tiên theo LCT trong **cùng trạm**. Nếu lái xe nhận task nằm ngoài khoảng ưu tiên của khung hiện tại, hệ thống không chặn thao tác nhưng tạo một hồ sơ vi phạm duy nhất, cảnh báo trên dashboard và tạo bản ghi chờ gửi Zalo.

## Bước 1 — Chạy migration

Trong Supabase SQL Editor, mở và chạy toàn bộ file:

`supabase/migrations/202608180021_station_violation_alerts.sql`

Nếu bạn đã gặp lỗi `syntax error at or near "current_time"`, hãy dùng đúng file `202608180021` trong gói cập nhật mới này (đã sửa). Nếu SQL Editor đã chạy dở và bạn không chắc có câu lệnh nào được lưu, chạy file sửa chữa `202608180022_repair_violation_alerts_current_time.sql` trước, sau đó chạy lại `202608180021`.

File này tạo:

- Khung ưu tiên từng trạm.
- Lịch sử vi phạm và đếm tái phạm 30 ngày.
- Cảnh báo dashboard chỉ admin/điều phối được tắt.
- Hàng đợi Zalo có khóa chống gửi trùng.
- Cấu hình thử nghiệm An Phú Đông.

## Bước 2 — Kiểm tra cấu hình web

Đăng nhập admin → **Thời gian điều phối**.

1. Chọn `Trạm sạc An Phú Đông`.
2. Chọn bãi `Quang Trung`.
3. Kiểm tra 25 / 30 / 30 / 10 phút.
4. Nhập nhãn nhóm Zalo `EV DISPATCH` và bật thử nghiệm.
5. Trong phần **Khung ưu tiên nhận xe**, kiểm tra hai dòng 20:00–02:00 và 02:00–03:00.

Các trạm khác giữ nguyên, không tự bật cảnh báo ưu tiên.

## Bước 3 — Lấy mã nhóm Zalo trước khi gửi thật

Tên nhóm `EV DISPATCH` không phải là mã kỹ thuật để Bot API gửi tin. Cần:

1. Mời Bot FT - EV DISPATCH vào nhóm EV DISPATCH.
2. Gửi một tin nhắn thử trong nhóm.
3. Lấy `chat_id`/conversation ID do Zalo Bot API trả về qua webhook hoặc getUpdates.
4. Lưu `chat_id` ở cấu hình server, không đưa token bot hoặc mã nhóm vào mã nguồn/trình duyệt.

Đến khi có `chat_id`, bảng `zalo_violation_outbox` vẫn lưu toàn bộ cảnh báo với trạng thái `pending`; không mất dữ liệu và không gửi sai nhóm.

## Bước 4 — Kiểm thử

1. Dùng một task An Phú Đông có ưu tiên 71 trong thời điểm 20:00–02:00.
2. Lái xe nhận task.
3. Kiểm tra `violation_cases` có đúng một dòng `priority_window`.
4. Dashboard hiện cảnh báo đỏ cho nhân viên thuộc An Phú Đông; admin/điều phối có nút **Tắt**.
5. Lặp lại vi phạm cùng loại để kiểm tra nhãn tái phạm lần 2 trong 30 ngày.
6. Khi chuyển trạng thái tiếp theo sau cảnh báo quá giờ, hồ sơ sẽ được đánh dấu đã xử lý; lịch sử và dashboard đã tắt vẫn được lưu.

## Lưu ý vận hành

- Bấm **Tắt** chỉ xác nhận đã xem cảnh báo dashboard, không xóa hồ sơ vi phạm.
- Hệ thống chỉ tạo một cảnh báo cho mỗi tình huống nhờ khóa idempotency.
- Để phát hiện quá hạn ngay cả khi không ai mở dashboard, cần lịch chạy mỗi phút trên Supabase Cron/Edge Function ở bước tích hợp Zalo tiếp theo. Không dùng Vercel Hobby Cron cho việc này.
