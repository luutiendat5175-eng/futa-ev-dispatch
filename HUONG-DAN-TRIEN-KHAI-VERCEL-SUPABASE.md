# Triển khai FUTA - EV Dispatch

Tài liệu này dùng để đưa đúng phiên bản đã kiểm tra lên Vercel. Không đưa file
`.env.local`, khóa Supabase Service Role hoặc token Zalo lên GitHub.

## 1. Chuẩn bị và tự kiểm tra

Trong thư mục dự án, chạy:

```powershell
npm.cmd install
npm.cmd run build
```

Chỉ tiếp tục khi lệnh build kết thúc thành công.

## 2. Đưa mã nguồn lên GitHub

1. Vào GitHub, tạo repository mới dạng **Private**, ví dụ `futa-ev-dispatch`.
2. Trong PowerShell tại thư mục dự án, chạy lần lượt:

```powershell
git add .
git commit -m "Release production"
git branch -M main
git remote add origin https://github.com/TEN-TAI-KHOAN/futa-ev-dispatch.git
git push -u origin main
```

3. Nếu `origin` đã tồn tại, không chạy dòng `git remote add`; dùng:

```powershell
git remote set-url origin https://github.com/TEN-TAI-KHOAN/futa-ev-dispatch.git
git push -u origin main
```

## 3. Tạo project trên Vercel

1. Đăng nhập Vercel bằng tài khoản GitHub.
2. Chọn **Add New > Project** và chọn repository vừa tạo.
3. Vercel tự nhận diện Next.js. Giữ các thiết lập mặc định:
   - Framework Preset: Next.js
   - Build Command: `npm run build`
   - Output Directory: để trống
4. Chưa bấm Deploy. Mở mục **Environment Variables** và thêm 3 biến cho cả
   `Production`, `Preview`, `Development`:

| Tên biến | Lấy ở đâu | Có được công khai? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API | Có |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Project Settings > API | Có, RLS vẫn bảo vệ dữ liệu |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Project Settings > API | Không. Chọn Sensitive và không đưa vào trình duyệt/GitHub |

5. Bấm **Deploy**. Sau khi xong, Vercel cấp URL dạng `https://...vercel.app`.

## 4. Cấu hình Supabase cho tên miền Vercel

1. Trong Supabase mở **Authentication > URL Configuration**.
2. Điền **Site URL** bằng URL Production của Vercel.
3. Thêm vào **Redirect URLs**:

```text
https://TEN-MIEN-VERCEL.vercel.app/**
http://localhost:3000/**
```

4. Nếu dùng tên miền riêng, thêm URL tên miền riêng tương tự sau khi gắn ở Vercel.
5. Kiểm tra bucket `task-proof` và `attendance-proof` vẫn là **Private**; không đổi
   thành Public.

## 5. Kiểm thử sau triển khai

1. Mở URL Vercel bằng điện thoại và đăng nhập bằng một tài khoản lái xe.
2. Chụp một ảnh nhận xe, kiểm tra GPS và ảnh có trong Supabase Storage.
3. Đăng nhập admin/điều phối, kiểm tra dashboard, map, Bảng tài, KPI và lịch sử.
4. Nhập một PA thử nghiệm và một Bảng tài thử nghiệm; kiểm tra task chỉ thuộc đúng
   ngày vận doanh.
5. Kiểm tra lại Vercel > Deployments > Functions Logs và Supabase > Logs Explorer.

## 6. Phát hành bản cập nhật sau này

Mỗi lần thay đổi mã:

```powershell
npm.cmd run build
git add .
git commit -m "Mo ta thay doi"
git push
```

GitHub push vào nhánh `main` sẽ tự tạo bản Production mới trên Vercel. Nếu có lỗi,
vào Vercel > Deployments, chọn bản chạy tốt gần nhất rồi **Promote to Production**.

## 7. Thay PA lỗi font bằng PA sạch

1. Trong Supabase SQL Editor, chạy file
   `supabase/manual-imports/20260818_archive_bad_pa_before_clean_reimport.sql`.
2. Import lại danh mục bãi/trạm bằng CSV UTF-8 sạch nếu tên vị trí cũ có ký tự `?`.
3. Import PA sạch trên web. Hệ thống tạo một phiên bản mới duy nhất và tự kích hoạt.
4. Không xóa PA/lịch sử cũ bằng Table Editor.

## 8. Xóa đúng 100 ảnh cũ nhất

Xem trước danh sách (không xóa):

```powershell
npm.cmd run delete-oldest-photos
```

Nếu danh sách đã đúng, xóa vĩnh viễn:

```powershell
npm.cmd run delete-oldest-photos -- --confirm
```

Lệnh dùng Storage API và chỉ xóa dữ liệu metadata sau khi Storage xác nhận xóa ảnh.
