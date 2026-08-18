import { createClient } from '@/infrastructure/supabase/server';

export const dynamic = 'force-dynamic';

export default async function TestConnectionPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('roles').select('*');

  const isConnectedButTableMissing =
    !!error && error.message.includes('does not exist');

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', lineHeight: 1.8 }}>
      <h1>Test kết nối Supabase</h1>

      <p>
        <strong>Trạng thái:</strong>{' '}
        {!error
          ? '✅ Kết nối OK, bảng roles đã có dữ liệu'
          : isConnectedButTableMissing
            ? '🟡 Kết nối Supabase THÀNH CÔNG (chỉ chưa có bảng roles - sẽ tạo ở bước B5)'
            : '🔴 Kết nối THẤT BẠI - kiểm tra lại .env.local'}
      </p>

      <p>
        <strong>Error (nếu có):</strong> {error ? error.message : 'Không có lỗi'}
      </p>
      <p>
        <strong>Data:</strong> {JSON.stringify(data)}
      </p>
    </div>
  );
}

