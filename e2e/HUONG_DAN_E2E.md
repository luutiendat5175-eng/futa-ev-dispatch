# HƯỚNG DẪN CHẠY PLAYWRIGHT E2E — Sprint 8

E2E test cần server thật + Supabase thật đang chạy, nên **không chạy được trong sandbox** lúc code — bạn tự chạy trên máy mình theo các bước sau.

## Bước 1: Cài trình duyệt cho Playwright (chỉ cần làm 1 lần)

```powershell
npx playwright install chromium
```

## Bước 2: Chuẩn bị 1 tài khoản test có thật trong DB

Dùng lại tài khoản Admin bạn đã tạo trước đó (MNV `29121` chẳng hạn), hoặc tạo riêng 1 tài khoản test qua Supabase Dashboard → Authentication → Add user (như đã làm ở phần Auth).

## Bước 3: Set biến môi trường cho test

```powershell
$env:E2E_TEST_MNV="29121"
$env:E2E_TEST_PASSWORD="mat-khau-that-cua-tai-khoan-do"
```

## Bước 4: Chạy song song server + E2E

**Cửa sổ PowerShell 1:**
```powershell
npm run dev
```

**Cửa sổ PowerShell 2** (đợi server chạy xong ở cửa sổ 1 trước):
```powershell
npm run e2e
```

## Kết quả mong đợi

```
Running 7 tests using 1 worker

  ✓ Auth - middleware chặn ... vào /dashboard khi chưa đăng nhập -> redirect về /login
  ✓ Auth - middleware chặn ... vào /task-board-demo khi chưa đăng nhập -> redirect về /login
  ✓ Auth - luồng đăng nhập ... đăng nhập đúng MNV/mật khẩu -> vào được trang sau đăng nhập
  ✓ Auth - luồng đăng nhập ... sai mật khẩu -> báo lỗi, KHÔNG chuyển trang
  ✓ Auth - luồng đăng nhập ... đăng xuất -> quay lại /login, vào /dashboard lại bị chặn
  ✓ Dashboard - luồng chính ... Dashboard tải được Map và Kanban
  ✓ Dashboard - luồng chính ... tạo Task qua form nhanh -> hiện trên Kanban

  7 passed
```

Nếu 2 test cuối (tạo Task, lọc theo Bãi) bị **skip** (không phải fail) — nghĩa là DB của bạn chưa có xe/bãi nào để test, không phải lỗi code. Import Bảng tài/Bãi trước rồi chạy lại.

## Xem báo cáo trực quan khi có test fail

```powershell
npx playwright show-report
```
Mở ra 1 trang web hiện từng bước test, kèm ảnh chụp màn hình lúc lỗi.
