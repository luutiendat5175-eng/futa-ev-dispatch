# FUTA – EV DISPATCH V40

## Mục tiêu cập nhật

- Biểu mẫu danh mục bãi, trạm, PA đậu đêm và nhân viên dùng Excel (`.xlsx`) để giữ đúng tiếng Việt.
- Nút **Tải dữ liệu hiện tại** của PA chỉ xuất **phiên bản PA cố định đang active mới nhất**; không xuất bảng tài hay task hằng ngày.
- Khi nhập lại bãi/trạm, hệ thống ưu tiên cập nhật bản ghi đã có theo mã, tên đã chuẩn hóa hoặc tọa độ trùng khớp. Nếu có nhiều bản ghi cùng khớp, lần nhập dừng và báo dòng lỗi để tránh tạo trùng.
- Điều phối có thể rollback task trong các trạm được phân công. Admin có thể rollback mọi trạm.

## Bước 1 – Chạy migration

Mở Supabase → **SQL Editor** → tạo một query mới, mở file:

`supabase/migrations/202608200029_excel_baseline_and_coordinator_rollback.sql`

Sao chép toàn bộ nội dung vào SQL Editor và bấm **Run**. Kết quả cần là `Success`.

Migration này không xóa lịch sử, ảnh hay task cũ.

## Bước 2 – Kiểm tra PA đậu đêm đang hiệu lực

Lỗi *“Chưa có PA đậu đêm cố định đang hiệu lực”* nghĩa là ngày vận doanh đang chọn chưa tìm được PA thỏa cả hai điều kiện:

1. `status = active`
2. `effective_from` không muộn hơn ngày vận doanh của bảng tài.

Ví dụ bảng tài ngày `2026-08-20` chỉ dùng PA có hiệu lực từ ngày `2026-08-20` hoặc sớm hơn.

Kiểm tra bằng SQL:

```sql
select version, status, effective_from, source_name, activated_at
from public.overnight_plan_configs
order by effective_from desc, version desc;
```

Nếu không có dòng `active` phù hợp, vào **Import dữ liệu** và nhập PA cố định trước, chọn đúng **Hiệu lực từ**, rồi mới nhập bảng tài.

## Bước 3 – Thay thế dữ liệu nền bị lỗi font

Thực hiện theo đúng thứ tự để các liên kết tên bãi/trạm trong PA luôn hợp lệ:

1. Trong trang **Import dữ liệu**, tải dữ liệu hiện tại của **Bãi đậu**, **Trạm sạc**, và **PA đậu đêm**.
2. Mở các file Excel, sửa tiếng Việt, mã/tên và tọa độ chính xác. Không đổi tiêu đề cột.
3. Nhập lại **Bãi đậu** trước, rồi **Trạm sạc**.
4. Nhập **PA đậu đêm cố định** sau cùng, chọn ngày hiệu lực phù hợp.
5. Cuối cùng mới nhập bảng tài theo ngày vận doanh.

Không dùng xoá hàng loạt các bản ghi cũ: danh mục đang có thể được task/lịch sử tham chiếu. Lần nhập mới sẽ cập nhật đúng bản ghi khi nhận diện được duy nhất. Nếu báo *trùng mơ hồ*, hãy sửa tên/mã/tọa độ trong file Excel để chỉ còn một vị trí tương ứng rồi nhập lại.

## Bước 4 – Rollback của điều phối

Sau khi migration được chạy và website được deploy:

- **Điều phối:** có nút rollback với task thuộc trạm mình được phân công.
- **Admin:** rollback mọi task.
- **Điều độ/lái xe:** không có quyền rollback.

Rollback giữ nguyên ảnh và lịch sử cũ; thao tác mới sau rollback sẽ tạo event và ảnh mới.

## Kiểm tra sau cập nhật

1. Tải mẫu Excel và mở bằng Excel/WPS: chữ tiếng Việt phải đúng.
2. Nhập một dòng bãi/trạm đã có: kết quả phải báo cập nhật thay vì tạo thêm bản ghi.
3. Nhập PA có ngày hiệu lực không muộn hơn ngày bảng tài.
4. Đăng nhập tài khoản điều phối đã được phân công trạm và thử rollback một task thuộc trạm đó.
