-- Import test data extracted from Bãi.csv, trạm.csv and XE.csv.
-- Scope: verified overnight depot, two charging stations, and seven B60 electric buses.
-- This script is idempotent: it may be run again without duplicating records.

begin;

insert into public.depots (code, name, x, y, address)
values
  ('DEPOT-DAM-MUOI', 'Đầm Muối', 10.86126678, 106.6893547, 'Đầm Muối')
on conflict (code) do update
set name = excluded.name,
    x = excluded.x,
    y = excluded.y,
    address = excluded.address,
    is_active = true;

insert into public.charging_stations (code, name, x, y)
values
  ('TRAM-QUANG-THUAN', 'Trạm sạc Quang Thuận', 10.84065983, 106.7202098),
  ('TRAM-AN-PHU-DONG', 'Trạm sạc An Phú Đông', 10.85937754, 106.7114547)
on conflict (code) do update
set name = excluded.name,
    x = excluded.x,
    y = excluded.y,
    is_active = true;

insert into public.vehicles (license_plate, vehicle_type_code)
values
  ('50E21792', 'B60'),
  ('50F02034', 'B60'),
  ('50E22433', 'B60'),
  ('50E21141', 'B60'),
  ('50H88781', 'B60'),
  ('50H88813', 'B60'),
  ('50H88587', 'B60')
on conflict (license_plate) do update
set vehicle_type_code = excluded.vehicle_type_code,
    is_active = true;

commit;

-- Quang Trung is intentionally excluded. The supplied longitude 106.4519838
-- needs confirmation before it is used in the map or GPS workflow.

-- Verification query (run separately if desired):
-- select code, name from public.depots order by code;
-- select code, name from public.charging_stations order by code;
-- select license_plate, vehicle_type_code from public.vehicles order by license_plate;
