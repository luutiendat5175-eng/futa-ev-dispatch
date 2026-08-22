-- MỤC ĐÍCH
-- Đưa các PA đậu đêm đang lỗi font về trạng thái lưu trữ trước khi import PA sạch.
-- KHÔNG xoá daily_plans, dispatch_tasks, lịch sử, ảnh hoặc PA cũ; vì các bảng đó
-- là bằng chứng vận hành của những ngày đã qua.
--
-- CÁCH DÙNG
-- 1. Chạy toàn bộ file này một lần trong Supabase SQL Editor với Role postgres.
-- 2. Vào web > Import dữ liệu, import lại Bãi và Trạm bằng file CSV UTF-8 sạch
--    (nếu tên trong danh mục cũ đang bị lỗi font), sau đó import PA đậu đêm sạch.
-- 3. Chỉ PA mới được active mới được dùng để tạo snapshot cho các Bảng tài mới.

begin;

-- Khóa các bản PA đang có để không có import đồng thời trong lúc thay thế.
lock table public.overnight_plan_configs in share row exclusive mode;

-- Không delete: các daily plan cũ có thể tham chiếu gián tiếp tới version này.
update public.overnight_plan_configs
set status = 'archived'
where status in ('active', 'draft');

commit;

-- KIỂM TRA SAU KHI CHẠY: cần trả về 0 dòng active/draft trước khi import lại.
select id, version, status, effective_from, source_name, created_at
from public.overnight_plan_configs
where status in ('active', 'draft')
order by version desc;

-- KIỂM TRA RÀNG BUỘC: PA mới sẽ luôn có duy nhất một đầu bến nội bộ cho mỗi
-- (phiên bản, tuyến, route_end_key). Đây là điều cho phép tuyến vòng tròn A/B.
select config_id, route_code, route_end_key, count(*) as duplicate_count
from public.overnight_plan_config_ends
group by config_id, route_code, route_end_key
having count(*) > 1;
