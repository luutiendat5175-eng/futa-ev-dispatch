# Cập nhật v23 — Import nhân viên an toàn

Không cần chạy migration Supabase cho bản cập nhật này.

1. Thay mã nguồn bằng thư mục v23, nhưng giữ lại file `.env.local` đang dùng.
2. Chạy `npm install`, sau đó `npm run dev`.
3. Vào **Quản trị người dùng** → **Tải mẫu import** để lấy mẫu có mã trạm thực tế.
4. Chọn file và bấm **Import CSV/Excel**. Hệ thống chỉ kiểm tra, chưa ghi dữ liệu.
5. Đọc danh sách tạo mới, cập nhật và lỗi. Nếu đúng, bấm **Xác nhận ghi dữ liệu**.

## Mã trạm

Hệ thống nhận cả mã đầy đủ và viết tắt theo tên trạm. Ví dụ:

- `TRAM-QUANG-THUAN` hoặc `QT`
- `TRAM-KHANG-VIET` hoặc `KV`
- `TRAM-AN-PHU-DONG` hoặc `APD`

Nếu mã không khớp, lỗi nêu rõ dòng import, mã không nhận diện và danh sách trạm hiện có.

## Quy tắc MSNV

- MSNV chưa tồn tại: tạo tài khoản mới với mật khẩu mặc định `123456`.
- MSNV đã tồn tại, không đổi thông tin: bỏ qua.
- MSNV đã tồn tại nhưng họ tên, vai trò, trạng thái hoặc trạm phân công thay đổi: hiển thị chi tiết để admin xác nhận trước khi cập nhật.
- MSNV trùng trong chính file: chặn import và nêu rõ dòng lỗi.
- Không cho đổi MSNV bằng import vì MSNV cũng là tài khoản đăng nhập; cần sửa thủ công nếu thực sự phải thay đổi.
