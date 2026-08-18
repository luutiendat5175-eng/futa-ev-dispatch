-- ============================================================
-- SEED DỮ LIỆU CHO LOAD TEST - chạy trong Supabase SQL Editor
-- ============================================================

-- Bước A: Tạo 50 xe test (biển số dễ nhận diện để xoá sau)
insert into vehicles (bien_so, trang_thai_hien_tai)
select 'LOADTEST-' || lpad(gs::text, 4, '0'), 'chua_sac'
from generate_series(1, 50) as gs;

-- Bước B: Lấy danh sách id của 50 xe vừa tạo, COPY kết quả này ra
-- (xem hướng dẫn cách lưu thành file vehicle-ids.json ở HUONG_DAN_LOAD_TEST.md)
select json_agg(id) as vehicle_ids_json
from vehicles
where bien_so like 'LOADTEST-%';

-- ============================================================
-- DỌN DẸP - chạy SAU KHI load test xong, tránh rác dữ liệu test
-- ============================================================

-- Xoá task_logs của các task test trước (vì có FK tới dispatch_tasks)
delete from task_logs
where task_id in (
  select id from dispatch_tasks
  where vehicle_id in (select id from vehicles where bien_so like 'LOADTEST-%')
);

delete from dispatch_tasks
where vehicle_id in (select id from vehicles where bien_so like 'LOADTEST-%');

delete from vehicles where bien_so like 'LOADTEST-%';
