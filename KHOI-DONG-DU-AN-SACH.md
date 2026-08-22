# Khởi động dự án sạch

## Yêu cầu

- Node.js 20 trở lên.
- Sao chép `.env.example` thành `.env.local` và điền thông tin Supabase.

## Cài đặt và chạy

```powershell
npm ci
npm run dev
```

Lệnh `npm run dev` đã được cấu hình dùng **Webpack** để tránh lỗi module Route Handler ngẫu nhiên của Turbopack trên Windows (`components.ComponentMod.handler is not a function`).

Mở `http://localhost:3000/login`, đăng nhập rồi truy cập dashboard. Không mở thẳng dashboard bằng phiên trình duyệt chưa đăng nhập.

## Khi nâng cấp dependency

```powershell
Remove-Item -LiteralPath .next -Recurse -Force
npm ci
npm run build
```

Không chép thư mục `.next` hoặc `node_modules` từ bản dự án cũ sang.
