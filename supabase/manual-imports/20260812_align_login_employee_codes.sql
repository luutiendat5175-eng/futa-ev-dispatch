-- The login screen derives the internal auth email as <MSNV>@noibo.local.
-- Align profile.employee_code with the MSNV used when each Auth user was created.
-- This affects the display/audit MSNV only; it never changes passwords or roles.

begin;

update public.profiles
set employee_code = case id::text
  when '78e5853e-bd71-4714-aab3-65af110fc2ed' then '29121'
  when 'c518661b-cd78-402b-93bc-8a4a688c5029' then '11111'
  when 'e907ad8f-9637-4f85-b1c3-4e2b1dd0c78c' then '12345'
  when 'f02bec25-6a66-4617-8e48-1e3aa6274d09' then '22222'
  else employee_code
end
where id::text in (
  '78e5853e-bd71-4714-aab3-65af110fc2ed',
  'c518661b-cd78-402b-93bc-8a4a688c5029',
  'e907ad8f-9637-4f85-b1c3-4e2b1dd0c78c',
  'f02bec25-6a66-4617-8e48-1e3aa6274d09'
);

commit;

select employee_code, full_name, role, is_active from public.profiles order by employee_code;
