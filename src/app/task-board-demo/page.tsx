'use client';

import { useDispatchTasksRealtime } from '@/features/dispatch-tasks/useDispatchTasksRealtime';
import { LogoutButton } from '@/components/auth/LogoutButton';

const STATUS_LABEL: Record<string, string> = {
  chua_sac: 'Chưa sạc',
  nhan_xe_dau_ben: 'Nhận xe đầu bến',
  giao_tram_sac: 'Giao trạm sạc',
  doi_sac: 'Đợi sạc',
  nhan_tram_sac: 'Nhận xe trạm sạc',
  giao_dau_ben: 'Giao đầu bến',
  hoan_thanh: 'Hoàn thành',
  moi: 'Mới (task phụ)',
  dang_xu_ly: 'Đang xử lý (task phụ)',
};

const TASK_TYPE_LABEL: Record<string, string> = {
  di_chuyen: 'Di chuyển xe',
  ho_tro: 'Hỗ trợ',
  kiem_tra: 'Kiểm tra',
  ve_sinh: 'Vệ sinh',
  dieu_dong: 'Điều động',
  phat_sinh: 'Phát sinh',
};

export default function TaskBoardDemoPage() {
  const { tasks, loading, connectionStatus } = useDispatchTasksRealtime();

  return (
    <div style={{ padding: 24, fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginBottom: 4 }}>Task Board (demo Realtime)</h1>
        <LogoutButton />
      </div>
      <p style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
        Trạng thái kết nối Realtime:{' '}
        <strong
          style={{
            color:
              connectionStatus === 'connected'
                ? 'green'
                : connectionStatus === 'error'
                  ? 'red'
                  : 'orange',
          }}
        >
          {connectionStatus}
        </strong>
        {' — '}Mở trang này ở 2 tab, tự đổi trạng thái 1 Task (qua API) ở tab này, tab kia sẽ tự
        cập nhật không cần refresh.
      </p>

      {loading ? (
        <p>Đang tải...</p>
      ) : tasks.length === 0 ? (
        <p>Chưa có Task nào. Tạo Task qua POST /api/v1/tasks trước.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
              <th style={{ padding: 8 }}>ID</th>
              <th style={{ padding: 8 }}>Loại</th>
              <th style={{ padding: 8 }}>Trạng thái</th>
              <th style={{ padding: 8 }}>ETA</th>
              <th style={{ padding: 8 }}>Tạo lúc</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{t.id.slice(0, 8)}...</td>
                <td style={{ padding: 8 }}>{TASK_TYPE_LABEL[t.task_type] ?? t.task_type}</td>
                <td style={{ padding: 8 }}>
                  <span
                    style={{
                      background: t.status === 'hoan_thanh' ? '#d1fae5' : '#fef3c7',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </td>
                <td style={{ padding: 8 }}>{t.eta_at ?? '-'}</td>
                <td style={{ padding: 8 }}>{new Date(t.created_at).toLocaleTimeString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
