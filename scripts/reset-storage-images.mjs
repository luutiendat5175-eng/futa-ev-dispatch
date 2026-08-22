import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local');
}

const supabase = createClient(url, key);
const buckets = ['task-proof', 'attendance-proof'];

async function listFiles(bucket, prefix = '') {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;

  const files = [];
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) files.push(path);
    else files.push(...await listFiles(bucket, path));
  }
  return files;
}

for (const bucket of buckets) {
  const files = await listFiles(bucket);

  for (let i = 0; i < files.length; i += 1000) {
    const { error } = await supabase.storage
      .from(bucket)
      .remove(files.slice(i, i + 1000));

    if (error) throw error;
  }

  console.log(`${bucket}: đã xóa ${files.length} tệp.`);
}