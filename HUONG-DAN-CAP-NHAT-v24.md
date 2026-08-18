# Cập nhật v24: tách lộ trình và KPI lái xe

Không cần chạy migration Supabase cho bản cập nhật này.

## Cài bản mới

1. Giải nén thư mục bản v24.
2. Chép file `.env.local` đang dùng vào thư mục dự án (nếu chưa có).
3. Mở PowerShell tại thư mục dự án, chạy:

```powershell
npm.cmd install
npm.cmd run dev
```

4. Mở lại `http://localhost:3000` và làm mới cứng trình duyệt bằng `Ctrl + F5`.

## Thay đổi

- Trên bản đồ, chiều đi **bãi → trạm** là nét xanh liền và được lệch sang một phía; chiều về **trạm → bãi** là nét đỏ đứt và lệch sang phía ngược lại. Hai lộ trình có thể chọn riêng dù cùng nối hai địa điểm.
- Lái xe đã có quyền xem menu **KPI**. Trang này hiển thị KPI cá nhân của chính lái xe trong ca vận doanh hiện tại; không hiển thị bộ lọc trạm hoặc dữ liệu của người khác.

## Nguyên tắc dữ liệu bảng tài theo ngày

- Mỗi ngày vận doanh có một kế hoạch riêng (`service_date`). Ca ngày N+1 bắt đầu từ 18:00 ngày N.
- Nếu ngày N có 3 tuyến, còn ngày N+1 chỉ có 2 tuyến được import, dashboard ngày N+1 chỉ có task của 2 tuyến đã import. Tuyến đã đóng sẽ **không tự mang task cũ sang ngày mới**.
- Task của ngày cũ, kể cả chưa hoàn thành, được chuyển sang **Quá hạn** khi mở ngày vận doanh mới; lịch sử và ảnh vẫn giữ nguyên nhưng không nằm trong dashboard ngày mới.
- Một tuyến vẫn còn hoạt động nhưng chưa được điều độ import file cho ngày N+1 cũng chưa có task trên ngày N+1. Khi điều độ import tuyến đó, task của tuyến sẽ được thêm vào cùng kế hoạch ngày đó, không thay thế các tuyến khác đã import.
