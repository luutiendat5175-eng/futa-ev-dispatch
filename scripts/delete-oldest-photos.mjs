import { createClient } from '@supabase/supabase-js';

const limit = 100;
const confirmed = process.argv.includes('--confirm');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local.');
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const [{ data: taskPhotos, error: taskError }, { data: attendancePhotos, error: attendanceError }] = await Promise.all([
  db.from('task_event_photos').select('id,storage_path,created_at').order('created_at', { ascending: true }).limit(limit),
  db.from('work_session_photos').select('id,storage_path,captured_at').order('captured_at', { ascending: true }).limit(limit),
]);
if (taskError) throw taskError;
if (attendanceError) throw attendanceError;

const candidates = [
  ...(taskPhotos ?? []).map((row) => ({ ...row, source: 'task', bucket: 'task-proof', time: row.created_at })),
  ...(attendancePhotos ?? []).map((row) => ({ ...row, source: 'attendance', bucket: 'attendance-proof', time: row.captured_at })),
].sort((a, b) => new Date(a.time).valueOf() - new Date(b.time).valueOf()).slice(0, limit);

if (!candidates.length) {
  console.log('Không có ảnh nào để xoá.');
  process.exit(0);
}

console.table(candidates.map((item) => ({ bucket: item.bucket, time: item.time, path: item.storage_path })));
if (!confirmed) {
  console.log(`Đây là bản xem trước. Để xoá vĩnh viễn ${candidates.length} ảnh trên, chạy lại với tham số --confirm.`);
  process.exit(0);
}

const groups = new Map();
for (const item of candidates) groups.set(item.bucket, [...(groups.get(item.bucket) ?? []), item]);

for (const [bucket, items] of groups) {
  const { error } = await db.storage.from(bucket).remove(items.map((item) => item.storage_path));
  if (error) throw new Error(`Không thể xoá ảnh trong bucket ${bucket}: ${error.message}`);
}

const taskIds = candidates.filter((item) => item.source === 'task').map((item) => item.id);
const attendanceIds = candidates.filter((item) => item.source === 'attendance').map((item) => item.id);
if (taskIds.length) {
  const { error } = await db.from('task_event_photos').delete().in('id', taskIds);
  if (error) throw error;
}
if (attendanceIds.length) {
  const { error } = await db.from('work_session_photos').delete().in('id', attendanceIds);
  if (error) throw error;
}

console.log(`Đã xoá vĩnh viễn ${candidates.length} ảnh cũ nhất: ${taskIds.length} ảnh giao nhận, ${attendanceIds.length} ảnh chấm công.`);
