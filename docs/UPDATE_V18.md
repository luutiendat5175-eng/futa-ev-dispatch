# Cập nhật v18: chống trùng task và sửa thông báo

1. Trong Supabase SQL Editor, chạy file `supabase/migrations/202608160018_deduplicate_tasks_and_protect_route_import.sql`.
2. Thay mã nguồn bằng bản v18, giữ `.env.local`, sau đó chạy `npm install` và `npm run dev`.

Migration tự rà soát các task điều chuyển đang hoạt động của toàn bộ dữ liệu hiện có:

- Nếu một xe có nhiều task trùng trong cùng ngày và bản trùng đã có lịch sử/ảnh, bản đó được chuyển thành `Quá hạn` để bảo toàn chứng cứ.
- Nếu bản trùng chưa có lịch sử, nó được xóa.
- Một chỉ mục duy nhất chặn việc tạo lại trùng xe trong cùng ngày.

Khi import lại một tuyến chưa có thao tác, hệ thống chỉ thay thế tuyến đó. Khi tuyến đã có thao tác, hệ thống báo rõ để không ghi đè lịch sử.
