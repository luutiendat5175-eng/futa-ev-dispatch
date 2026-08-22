# Phân quyền và quy trình vận hành

## Nguyên tắc chung

- **Dữ liệu nền** gồm bãi, trạm, PA đậu đêm, loại xe và phân công trạm. Chỉ thay đổi khi có biến động.
- **Bảng tài** là dữ liệu theo ngày vận doanh. Mỗi lần import tạo hoặc cập nhật task của đúng tuyến, không được thay thế các tuyến khác.
- Lái xe chỉ nhìn thấy task, bãi và trạm thuộc các trạm được phân công. Admin và điều độ xem toàn hệ thống. Điều phối xem phạm vi trạm được phân công.
- Mọi chuyển trạng thái của xe phải có GPS và ít nhất một ảnh. Ảnh, GPS và lịch sử không bị xóa khi admin rollback hoặc khi task quá hạn.

## Bảng quyền

| Chức năng | Admin | Điều phối trạm | Điều độ dữ liệu | Lái xe di dời |
| --- | --- | --- | --- | --- |
| Xem dashboard/map | Toàn bộ | Trạm được phân công | Toàn bộ | Trạm được phân công |
| Nhận và chuyển trạng thái xe | Không thao tác thay lái xe | Giám sát | Không | Có, trong trạm được phân công |
| Ảnh/GPS giao nhận | Xem lịch sử | Xem lịch sử | Xem lịch sử | Chụp/tải ảnh, gửi GPS |
| Rollback task | Có | Không | Không | Không |
| Import bảng tài, đối chiếu LCT | Có | Không | Có | Không |
| Import/chỉnh PA, bãi, trạm | Có | Không | Không | Không |
| Phân công nhân sự, tạo/sửa người dùng | Có | Không | Không | Không |
| Cấu hình thời gian/vi phạm | Có | Không | Không | Không |
| Thông báo theo trạm | Tạo/tắt trong phạm vi được phép | Tạo/tắt trong trạm được phân công | Không | Chỉ xem trong trạm được phân công |
| KPI | Toàn hệ thống, lọc ngày/trạm, xuất | Chỉ trạm được phân công, xuất | Toàn hệ thống, xuất | KPI cá nhân ngày hiện tại, không xuất dữ liệu chung |
| Chấm công | Vào/ra ca và xuất | Vào/ra ca, xem/xuất trong trạm | Không | Vào/ra ca của chính mình, không xuất |
| Lịch sử giao nhận | Toàn bộ | Trạm được phân công | Toàn bộ | Task của chính mình/phạm vi trạm |
| Nhãn QR | Tạo/in | Tạo/in | Tạo/in | Chỉ quét QR |

## Luồng làm việc lái xe di dời

1. Đăng nhập bằng MSNV và PIN, cấp quyền GPS.
2. Vào **Chấm công**, chụp hoặc tải ảnh cùng GPS để vào ca. Chưa vào ca thì không được nhận task.
3. Dashboard chỉ hiển thị task tới trạm mà lái xe được phân công. Có thể quét QR để tìm đúng xe.
4. Bấm **Nhận task / Nhận xe** tại bãi, chụp ít nhất một ảnh và gửi GPS. Xe ở trạng thái **Đã nhận** và nhân viên nằm trên lộ trình **bãi → trạm**.
5. Đến trạm, bấm **Giao trạm sạc**, kèm ảnh/GPS. Nhân viên xuất hiện tại trạm với thời gian thao tác; có thể nhận task khác ngay sau đó.
6. Bất kỳ lái xe được phân công trạm có thể bấm **Nhận xe trạm sạc**. Không bắt buộc là người đã giao xe vào trạm. Ảnh/GPS được ghi nhận và người nhận xuất hiện trên lộ trình **trạm → bãi**.
7. Bấm **Trả xe** tại bãi, kèm ảnh/GPS. Xe hoàn thành và nhân viên hiện ở bãi. Sau khi trả xe có thể nhận task mới ngay.
8. Nếu không thao tác trước thời hạn của lộ trình hoặc thời gian chờ trạm, hệ thống tạo cảnh báo dashboard. Lịch sử vẫn được giữ tới khi có thao tác tiếp theo.

## Luồng điều phối trạm

1. Theo dõi bản đồ và kanban của trạm mình. Map tách từng cặp **bãi ↔ trạm**, không gom các bãi khác nhau.
2. Chọn bãi, trạm hoặc lộ trình để xem nhân viên, biển số và thời gian thao tác. Danh sách mới nhất ở trên; người thao tác sớm hơn ở dưới.
3. Theo dõi cảnh báo quá thời gian, sai ưu tiên và thông báo của trạm; tắt cảnh báo sau khi đã xử lý.
4. Xem KPI, lịch sử và chấm công của trạm; điều phối không được tự chuyển trạng thái hay rollback task thay lái xe.
5. Khi cần thay đổi phân công, thông báo hoặc cấu hình thời gian, gửi admin thực hiện.

## Luồng điều độ dữ liệu

1. Kiểm tra PA đậu đêm đang hiệu lực, bãi/trạm và xe nền.
2. Import bảng tài của các tuyến được giao cho ngày vận doanh. Kiểm tra tên đầu bến, biển số và LCT trước khi xác nhận.
3. Import lại cùng tuyến chỉ thay các xe chưa có thao tác; xe đã có sự kiện/ảnh/GPS giữ nguyên để bảo toàn lịch sử.
4. Đối chiếu bảng tài, xử lý xe mới theo màn hình xác nhận, rồi theo dõi task tạo ra trên dashboard. Điều độ không trực tiếp nhận/giao/trả xe.

## Luồng admin

1. Thiết lập dữ liệu nền: bãi, trạm, PA cố định, loại xe, thời gian vận hành, cửa sổ ưu tiên và phân công nhân sự.
2. Quản trị người dùng, kiểm tra/import dữ liệu, theo dõi toàn hệ thống.
3. Rollback được task về trạng thái hợp lệ; lịch sử, ảnh và GPS cũ được giữ, thao tác lại sinh lịch sử/ảnh mới.
4. Khi dữ liệu ngày có sai lệch lớn, dùng **Xóa task ngày** và nhập chính xác cụm xác nhận. Hành động chỉ chuyển task thành quá hạn, không xóa lịch sử/ảnh/GPS.

## Kiểm tra khi lái xe không thấy task

1. Kiểm tra nhân viên có vai trò `lái xe di dời`, trạng thái hoạt động và đã vào ca.
2. Trong **Quản trị người dùng**, kiểm tra nhân viên được phân công đúng trạm đích của task.
3. Kiểm tra task thuộc ngày vận doanh mới nhất, loại `di_chuyen`, và chưa `qua_han`.
4. Kiểm tra `from_depot_id` của task khớp với `plan_route_ends.overnight_depot_id`. Migration `202608200026` tự đồng bộ điều này cho mọi bãi/trạm.
