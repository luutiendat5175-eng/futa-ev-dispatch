import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

export const runtime = 'nodejs';
const ROLES = new Set(['admin', 'dieu_do', 'dieu_phoi', 'lai_xe']);
const defaultPassword = '123456';
const internalEmail = (code: string) => `${code.toLowerCase()}@noibo.local`;
const cleanCode = (value: unknown) => String(value ?? '').trim().toUpperCase();
const cleanName = (value: unknown) => String(value ?? '').trim();
const isActive = (value: unknown) => !['false', '0', 'không', 'khong', 'inactive'].includes(String(value ?? '').trim().toLowerCase());
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]+/gi, '').toUpperCase();

async function adminOnly() {
  const actor = await getCurrentUserContext();
  if (actor.role !== 'admin') throw new Error('FORBIDDEN');
  return actor;
}

async function stationIds(db: ReturnType<typeof createServiceRoleClient>, stationCodes: string[]) {
  if (!stationCodes.length) return [] as string[];
  const { data, error } = await db.from('charging_stations').select('id,code,name').eq('is_active', true);
  if (error) throw new Error(error.message);
  const aliases = new Map<string, string>();
  for (const station of (data ?? []) as { id: string; code: string; name: string }[]) {
    const variants = [station.code, station.name, station.code.replace(/^TRAM[-_ ]?/i, ''), station.name.replace(/^trạm sạc\s*/i, '')];
    for (const value of variants) aliases.set(normalize(value), station.id);
  }
  const missing = stationCodes.filter((code) => !aliases.has(normalize(code)));
  if (missing.length) {
    const supported = (data ?? []).map((station: { code: string; name: string }) => `${station.code} (${station.name})`).join('; ');
    throw new Error(`Không nhận diện mã trạm: ${missing.join(', ')}. Có thể nhập mã đầy đủ hoặc viết tắt theo tên, ví dụ QT/KV/APD. Trạm đang có: ${supported}`);
  }
  return [...new Set(stationCodes.map((code) => aliases.get(normalize(code))!))];
}

async function saveAssignments(db: ReturnType<typeof createServiceRoleClient>, profileId: string, role: string, codes: string[], assignedBy: string) {
  const ids = ['lai_xe', 'dieu_phoi'].includes(role) ? await stationIds(db, codes) : [];
  const { error: removeError } = await db.from('employee_station_base_assignments').delete().eq('profile_id', profileId);
  if (removeError) throw new Error(removeError.message);
  if (ids.length) {
    const { error } = await db.from('employee_station_base_assignments').insert(ids.map((charging_station_id) => ({ profile_id: profileId, charging_station_id, assigned_by: assignedBy })));
    if (error) throw new Error(error.message);
  }
}

type Payload = { employeeCode: string; fullName: string; role: string; isActive?: boolean; stationCodes?: string[] };
async function createEmployee(db: ReturnType<typeof createServiceRoleClient>, actorId: string, payload: Payload) {
  const employeeCode = cleanCode(payload.employeeCode); const fullName = cleanName(payload.fullName); const role = String(payload.role ?? 'lai_xe');
  if (!employeeCode || !fullName || !ROLES.has(role)) throw new Error('MSNV, họ tên hoặc vai trò không hợp lệ.');
  const { data: created, error: authError } = await db.auth.admin.createUser({ email: internalEmail(employeeCode), password: defaultPassword, email_confirm: true });
  if (authError || !created.user) throw new Error(authError?.message ?? 'Không thể tạo tài khoản đăng nhập.');
  const { error: profileError } = await db.from('profiles').insert({ id: created.user.id, employee_code: employeeCode, full_name: fullName, role, is_active: payload.isActive !== false });
  if (profileError) { await db.auth.admin.deleteUser(created.user.id); throw new Error(profileError.message); }
  await saveAssignments(db, created.user.id, role, (payload.stationCodes ?? []).map(cleanCode).filter(Boolean), actorId);
  return created.user.id;
}

async function updateEmployee(db: ReturnType<typeof createServiceRoleClient>, actorId: string, id: string, payload: Payload) {
  const employeeCode = cleanCode(payload.employeeCode); const fullName = cleanName(payload.fullName); const role = String(payload.role ?? 'lai_xe');
  const { data: before } = await db.from('profiles').select('employee_code').eq('id', id).maybeSingle();
  if (!before) throw new Error('Không tìm thấy nhân viên cần cập nhật.');
  if (before.employee_code !== employeeCode) throw new Error('Không cho phép đổi MSNV bằng import. Hãy chỉnh sửa thủ công để bảo đảm tài khoản đăng nhập được đối soát.');
  const { error } = await db.from('profiles').update({ full_name: fullName, role, is_active: payload.isActive !== false, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
  await saveAssignments(db, id, role, (payload.stationCodes ?? []).map(cleanCode).filter(Boolean), actorId);
}

type ExistingProfile = { id: string; employee_code: string; full_name: string; role: string; is_active: boolean };
type ImportRow = Payload & { row: number; stationIds: string[]; profileId?: string; changes: string[] };
async function inspectImport(db: ReturnType<typeof createServiceRoleClient>, rawRows: Record<string, unknown>[]) {
  const { data: profiles, error: profileError } = await db.from('profiles').select('id,employee_code,full_name,role,is_active');
  if (profileError) throw new Error(profileError.message);
  const { data: assignments, error: assignmentError } = await db.from('employee_station_base_assignments').select('profile_id,charging_station_id').eq('is_active', true);
  if (assignmentError) throw new Error(assignmentError.message);
  const known = new Map<string, ExistingProfile>(((profiles ?? []) as ExistingProfile[]).map((profile) => [profile.employee_code, profile]));
  const assignmentMap = new Map<string, string[]>();
  for (const assignment of (assignments ?? []) as { profile_id: string; charging_station_id: string }[]) assignmentMap.set(assignment.profile_id, [...(assignmentMap.get(assignment.profile_id) ?? []), assignment.charging_station_id]);
  const seen = new Set<string>(); const rows: ImportRow[] = []; const errors: { row: number; message: string }[] = [];
  for (const [index, source] of rawRows.entries()) {
    const payload: Payload = { employeeCode: String(source['MSNV'] ?? source['employee_code'] ?? ''), fullName: String(source['Họ tên'] ?? source['Ho ten'] ?? source['full_name'] ?? ''), role: String(source['Vai trò'] ?? source['Vai tro'] ?? source['role'] ?? 'lai_xe'), isActive: isActive(source['Hoạt động'] ?? source['Hoat dong'] ?? source['is_active']), stationCodes: String(source['Mã trạm'] ?? source['Ma tram'] ?? source['station_codes'] ?? '').split(',').map(cleanCode).filter(Boolean) };
    payload.employeeCode = cleanCode(payload.employeeCode); payload.fullName = cleanName(payload.fullName);
    if (!payload.employeeCode || !payload.fullName || !ROLES.has(payload.role)) { errors.push({ row: index + 2, message: 'Thiếu MSNV, họ tên hoặc vai trò không hợp lệ.' }); continue; }
    if (seen.has(payload.employeeCode)) { errors.push({ row: index + 2, message: `MSNV ${payload.employeeCode} lặp lại trong chính file import.` }); continue; } seen.add(payload.employeeCode);
    try {
      const ids = await stationIds(db, payload.stationCodes ?? []); const current = known.get(payload.employeeCode); const changes: string[] = [];
      if (current) {
        if (current.full_name !== payload.fullName) changes.push(`Họ tên: “${current.full_name}” → “${payload.fullName}”`);
        if (current.role !== payload.role) changes.push(`Vai trò: ${current.role} → ${payload.role}`);
        if (current.is_active !== (payload.isActive !== false)) changes.push(`Trạng thái: ${current.is_active ? 'đang hoạt động' : 'ngừng'} → ${payload.isActive !== false ? 'đang hoạt động' : 'ngừng'}`);
        const beforeStations = [...(assignmentMap.get(current.id) ?? [])].sort().join(','); const afterStations = [...ids].sort().join(',');
        if (beforeStations !== afterStations) changes.push('Phân công trạm sẽ thay đổi');
      }
      rows.push({ ...payload, row: index + 2, stationIds: ids, profileId: current?.id, changes });
    } catch (caught) { errors.push({ row: index + 2, message: caught instanceof Error ? caught.message : 'Không đối chiếu được mã trạm.' }); }
  }
  return { rows, errors };
}

export async function GET() {
  try {
    await adminOnly(); const db = createServiceRoleClient();
    const [profiles, stations, assignments] = await Promise.all([
      db.from('profiles').select('id,employee_code,full_name,role,is_active,created_at').order('employee_code'),
      db.from('charging_stations').select('id,code,name').eq('is_active', true).order('code'),
      db.from('employee_station_base_assignments').select('profile_id,charging_station_id').eq('is_active', true),
    ]);
    return NextResponse.json({ profiles: profiles.data ?? [], stations: stations.data ?? [], assignments: assignments.data ?? [], dailyPlanId: null });
  } catch (error) { return NextResponse.json({ error: { message: error instanceof UnauthenticatedError ? 'Đăng nhập lại.' : error instanceof Error && error.message === 'FORBIDDEN' ? 'Chỉ admin.' : 'Không tải được danh sách nhân viên.' } }, { status: error instanceof Error && error.message === 'FORBIDDEN' ? 403 : 401 }); }
}

export async function POST(request: Request) {
  try {
    const actor = await adminOnly(); const db = createServiceRoleClient(); const body = await request.json();
    const id = await createEmployee(db, actor.userId, body);
    return NextResponse.json({ id, defaultPassword });
  } catch (error) { return NextResponse.json({ error: { message: error instanceof Error ? error.message : 'Không thể tạo nhân viên.' } }, { status: 400 }); }
}

export async function PUT(request: Request) {
  try {
    const actor = await adminOnly(); const db = createServiceRoleClient(); const body = await request.json();
    const id = String(body.id ?? ''); const employeeCode = cleanCode(body.employeeCode); const fullName = cleanName(body.fullName); const role = String(body.role ?? '');
    if (!id || !employeeCode || !fullName || !ROLES.has(role)) throw new Error('Dữ liệu nhân viên không hợp lệ.');
    const { data: before } = await db.from('profiles').select('employee_code').eq('id', id).maybeSingle();
    if (!before) throw new Error('Không tìm thấy nhân viên.');
    if (before.employee_code !== employeeCode) { const { error } = await db.auth.admin.updateUserById(id, { email: internalEmail(employeeCode), email_confirm: true }); if (error) throw new Error(error.message); }
    const { error } = await db.from('profiles').update({ employee_code: employeeCode, full_name: fullName, role, is_active: body.isActive !== false, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
    await saveAssignments(db, id, role, (body.stationCodes ?? []).map(cleanCode).filter(Boolean), actor.userId);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: { message: error instanceof Error ? error.message : 'Không thể lưu nhân viên.' } }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await adminOnly(); const db = createServiceRoleClient(); const form = await request.formData(); const file = form.get('file');
    if (!(file instanceof File)) throw new Error('Hãy chọn file CSV hoặc Excel.');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' }); const first = workbook.Sheets[workbook.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(first, { defval: '' }); const inspected = await inspectImport(db, parsed);
    const updates = inspected.rows.filter(row => row.profileId && row.changes.length); const creates = inspected.rows.filter(row => !row.profileId);
    if (form.get('confirm') !== 'true') return NextResponse.json({ preview: true, creates: creates.length, unchanged: inspected.rows.filter(row => row.profileId && !row.changes.length).length, updates: updates.map(row => ({ row: row.row, employeeCode: row.employeeCode, changes: row.changes })), errors: inspected.errors });
    if (inspected.errors.length) return NextResponse.json({ error: { message: `Không ghi dữ liệu vì còn ${inspected.errors.length} dòng lỗi. Hãy sửa file trước.` }, errors: inspected.errors }, { status: 422 });
    for (const row of inspected.rows) { if (row.profileId) { if (row.changes.length) await updateEmployee(db, actor.userId, row.profileId, row); } else await createEmployee(db, actor.userId, row); }
    return NextResponse.json({ ok: true, creates: creates.length, updates: updates.length, unchanged: inspected.rows.length - creates.length - updates.length });
  } catch (error) { return NextResponse.json({ error: { message: error instanceof Error ? error.message : 'Không thể import.' } }, { status: 400 }); }
}
