import { createClient } from '@supabase/supabase-js';

const [employeeCode, pin] = process.argv.slice(2);
if (!/^\d{4,}$/.test(employeeCode ?? '') || !/^\d{4,}$/.test(pin ?? '')) {
  console.error('Cách dùng: node scripts/reset-internal-pin.mjs <MSNV> <PIN-moi-tu-4-so>');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local.');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
// profiles.id is the same UUID as auth.users.id.  Use MSNV instead of an
// assumed internal email, because the email may have been edited in Supabase.
const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('id, employee_code, full_name, is_active')
  .eq('employee_code', employeeCode)
  .maybeSingle();
if (profileError) throw profileError;
if (!profile) {
  throw new Error(`Khong tim thay MSNV ${employeeCode} trong bang profiles. Hay chay 20260812_align_login_employee_codes.sql truoc.`);
}
if (!profile.is_active) throw new Error(`MSNV ${employeeCode} dang bi khoa.`);
const { error } = await supabase.auth.admin.updateUserById(profile.id, { password: pin, email_confirm: true });
if (error) throw error;
console.log(`Da dat lai PIN cho MSNV ${employeeCode} (${profile.full_name}).`);
