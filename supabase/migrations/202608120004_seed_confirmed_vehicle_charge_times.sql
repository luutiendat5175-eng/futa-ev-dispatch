-- Charging durations confirmed by operations on 2026-08-12.
-- Other types (for example B55) deliberately remain unconfigured until
-- operations provides their approved duration; import must flag them.

insert into public.vehicle_types (code, charge_minutes)
values
  ('B30', 70),
  ('B40', 80),
  ('B60', 90),
  ('B80', 100)
on conflict (code) do update
set charge_minutes = excluded.charge_minutes,
    updated_at = now();
