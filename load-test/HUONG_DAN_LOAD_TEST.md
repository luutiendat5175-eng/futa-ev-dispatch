# HƯỚNG DẪN LOAD TEST — Sprint 8

## Bước 1: Cài k6 (công cụ load test)

**Windows (PowerShell, Run as Administrator):**
```powershell
scoop install k6
```
(nếu chưa có Scoop, xem lại hướng dẫn cài Scoop ở phần trước trong dự án)

**Kiểm tra cài đúng:**
```powershell
k6 version
```
→ Kết quả mong đợi: hiện số phiên bản, vd `k6 v0.5x.x`.

---

## Bước 2: Seed 50 xe test vào Supabase

1. Mở Supabase Dashboard → **SQL Editor**
2. Copy đoạn **Bước A** trong file `seed-and-cleanup.sql` (phần tạo 50 xe `LOADTEST-0001`...`LOADTEST-0050`), dán vào SQL Editor, chạy.
3. **Kết quả mong đợi:** `INSERT 0 50` (đã tạo 50 dòng).

---

## Bước 3: Lấy danh sách UUID của 50 xe vừa tạo

1. Vẫn trong SQL Editor, chạy tiếp đoạn **Bước B** (`select json_agg(id)...`).
2. Kết quả trả về 1 ô duy nhất chứa mảng JSON dạng `["uuid-1","uuid-2",...]`.
3. Bấm vào ô kết quả đó → chọn **Copy** (hoặc click phải → Copy cell).

---

## Bước 4: Lưu danh sách UUID thành file

Trong thư mục `load-test/` của project, tạo file mới tên `vehicle-ids.json`, dán y nguyên mảng JSON vừa copy vào, lưu lại. Ví dụ nội dung file:
```json
["a1b2c3d4-...", "e5f6g7h8-...", ...]
```

---

## Bước 5: Lấy 1 `userId` bất kỳ để dùng làm `createdBy`

Trong SQL Editor, chạy:
```sql
select id from users limit 1;
```
Nếu bảng `users` đang rỗng (chưa có Auth/chưa tạo user nào), chạy tạm:
```sql
insert into users (mnv, full_name, loai_nhan_su)
values ('LOADTEST-USER', 'Load Test User', 'admin')
returning id;
```
→ Copy `id` trả về, dùng cho bước 6.

---

## Bước 6: Chạy server + load test song song

**Cửa sổ PowerShell 1** — chạy app:
```powershell
npm run dev
```

**Cửa sổ PowerShell 2** — chạy load test:
```powershell
cd load-test
$env:BASE_URL="http://localhost:3000"
$env:VEHICLE_IDS_JSON="./vehicle-ids.json"
$env:CREATED_BY="<uuid-user-lay-o-buoc-5>"
k6 run dispatch-tasks-load-test.js
```

**Trình duyệt** — mở song song để mắt thấy Realtime hoạt động dưới tải:
```
http://localhost:3000/task-board-demo
```
→ Trong lúc k6 đang chạy, quan sát trang này — phải thấy danh sách Task **tự động nhảy số lượng lên** gần như ngay lập tức, không cần bấm refresh.

---

## Bước 7: Đọc kết quả k6

Sau khi chạy xong (khoảng vài giây), terminal hiện bảng tổng kết dạng:
```
     ✓ status là 201 (tạo thành công)
     ✓ thời gian phản hồi < 2s

     checks.........................: 100.00% ✓ 100  ✗ 0
     http_req_duration..............: avg=... p(95)=...
     http_req_failed.................: 0.00%
```

**Kết quả ĐẠT nếu:**
- `checks` gần 100% (cho phép vài % lỗi do trùng thời điểm tạo Task, không phải lỗi hệ thống)
- `http_req_failed` dưới 5%
- `http_req_duration p(95)` dưới 2000ms (2 giây)

**Nếu KHÔNG đạt** (nhiều lỗi, chậm) → chụp lại toàn bộ output terminal gửi tôi, tôi sẽ phân tích nguyên nhân (thường do Supabase Free tier giới hạn connection, hoặc cần đánh index).

---

## Bước 8: Dọn dẹp dữ liệu test

**Bắt buộc làm** sau khi test xong, tránh rác 50 xe + Task giả trong hệ thống thật:

1. Quay lại Supabase SQL Editor.
2. Copy đoạn **"DỌN DẸP"** trong `seed-and-cleanup.sql`, chạy.
3. Kiểm tra: `select count(*) from vehicles where bien_so like 'LOADTEST-%';` → phải trả về `0`.

---

## Lưu ý

- Nếu deploy lên Vercel rồi, đổi `BASE_URL` thành domain Vercel để test tải thật gần với production hơn (test trên `localhost` chỉ phản ánh máy của bạn, không phản ánh đúng độ trễ mạng + giới hạn gói Supabase Free).
- Free tier Supabase có giới hạn số connection đồng thời — nếu load test lớn hơn (vd 200+ VU), có thể cần nâng gói hoặc điều chỉnh connection pooling, không phải lỗi code.
