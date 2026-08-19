-- Import all five stations whose coordinates were corrected in trạm.csv.
-- The charging-port count is deliberately not stored in this version.

insert into public.charging_stations (code, name, x, y)
values
  ('TRAM-QUANG-THUAN', 'Trạm sạc Quang Thuận', 10.8406598302763, 106.720209841423),
  ('TRAM-AN-PHU-DONG', 'Trạm sạc An Phú Đông', 10.8593775379217, 106.711454688341),
  ('TRAM-TRAN-DAI-NGHIA', 'Trạm sạc Trần Đại Nghĩa', 10.728194857016200, 106.58761372376799),
  ('TRAM-HOC-MON', 'Trạm sạc Hóc Môn', 10.905238812606832, 106.60269050716359),
  ('TRAM-KHANG-VIET', 'Trạm sạc Khang Việt', 10.858904947413226, 106.78666682876371)
on conflict (code) do update
set name = excluded.name,
    x = excluded.x,
    y = excluded.y,
    is_active = true;

select code, name, x, y from public.charging_stations order by name;
