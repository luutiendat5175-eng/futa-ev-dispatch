-- Import the 17 verified overnight depots from Bãi.csv.
-- This is safe to run after the first test import; records are updated by code.

insert into public.depots (code, name, x, y, address)
values
  ('DEPOT-TAN-TUC', 'Tân Túc', 10.679858381586063, 106.58479460050596, '749 Quang Trung, HCM'),
  ('DEPOT-VAN-THANH', 'Bến xe buýt Vân Thánh', 10.801377909226252, 106.7166003292063, 'Đầm Muối'),
  ('DEPOT-QUANG-TRUNG', 'Quang Trung', 10.840809447553143, 106.64510179422311, 'TD'),
  ('DEPOT-CHO-LON', 'Bến xe buýt Chợ Lớn', 10.751375662540235, 106.65063970007944, 'TD'),
  ('DEPOT-DHQG-A-MOI', 'Bến xe buýt khu A ĐHQG (mới)', 10.875601689788732, 106.80452293318582, 'TD'),
  ('DEPOT-TAN-PHU', 'Bến xe buýt Tân Phú', 10.809275474100744, 106.63375778143885, 'TD'),
  ('DEPOT-LE-MINH-XUAN', 'Bến xe buýt Lê Minh Xuân', 10.758786515063328, 106.5438648237684, 'TD'),
  ('DEPOT-BINH-THAI', 'Bình Thái', 10.832874329321633, 106.76395872561383, 'TD'),
  ('DEPOT-TAI-LOC-2', 'CHXD Tài Lộc 2 (10tr4)', 10.97368217908156, 106.63989588144076, 'TD'),
  ('DEPOT-TAN-QUY', 'Bến xe buýt Tân Quy', 10.986844929483219, 106.5749744706708, 'TD'),
  ('DEPOT-HOC-MON', 'Bến xe buýt Hóc Môn', 10.913328511320092, 106.56534567163425, 'TD'),
  ('DEPOT-CU-CHI', 'Bến xe Củ Chi', 10.971544090917037, 106.48212814891656, 'TD'),
  ('DEPOT-SAI-GON', 'Bến xe buýt Sài Gòn', 10.767938368480763, 106.6894818771664, 'TD'),
  ('DEPOT-NONG-LAM', 'ĐH Nông Lâm', 10.868105044939886, 106.78754425825537, 'TD'),
  ('DEPOT-DHQG-B', 'Bến xe buýt khu B ĐHQG', 10.886019553348214, 106.77560413550657, 'TD'),
  ('DEPOT-THANH-HIEP-PHAT', 'Thành Hiệp Phát', 10.712444782023972, 106.59871909946162, 'TD'),
  ('DEPOT-BIEN-HOA', 'Bến xe Biên Hoà', 10.954437122686926, 106.8092056949357, 'TD')
on conflict (code) do update
set name = excluded.name,
    x = excluded.x,
    y = excluded.y,
    address = excluded.address,
    is_active = true;

select code, name, x, y from public.depots order by name;
