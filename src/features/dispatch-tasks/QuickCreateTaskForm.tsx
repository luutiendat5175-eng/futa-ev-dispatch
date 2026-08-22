'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { YardLocation } from '@/components/yard-map/YardMapCanvas';

interface Vehicle {
  id: string;
  license_plate: string;
}

const TASK_TYPES = [
  { value: 'di_chuyen', label: 'Di chuyển xe' },
  { value: 'ho_tro', label: 'Hỗ trợ' },
  { value: 'kiem_tra', label: 'Kiểm tra' },
  { value: 've_sinh', label: 'Vệ sinh' },
  { value: 'dieu_dong', label: 'Điều động' },
  { value: 'phat_sinh', label: 'Phát sinh' },
];

/**
 * Form tạo Task NHANH - dùng để TEST (bộ lọc, Kanban, Realtime), không phải
 * form sản phẩm hoàn chỉnh (chưa có validate đầy đủ, chưa đẹp UI). Gọi thẳng
 * POST /api/v1/tasks qua fetch same-origin -> trình duyệt TỰ GỬI cookie session,
 * không cần copy access token thủ công như dùng Postman.
 */
export function QuickCreateTaskForm({ depots, stations }: { depots: YardLocation[]; stations: YardLocation[] }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [loaiTask, setLoaiTask] = useState('di_chuyen');
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/v1/vehicles')
      .then((res) => res.json())
      .then((data) => setVehicles(data.vehicles ?? []));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!vehicleId) {
      setMessage({ type: 'error', text: 'Chọn xe trước đã' });
      return;
    }

    setLoading(true);
    setMessage(null);

    const res = await fetch('/api/v1/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleId,
        loaiTask,
        fromLocationId: fromLocationId || null,
        toLocationId: toLocationId || null,
      }),
    });
    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMessage({ type: 'error', text: body?.error?.message ?? 'Tạo Task thất bại' });
      return;
    }

    setMessage({ type: 'success', text: `Đã tạo Task #${body.task.id.slice(0, 8)}` });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'center',
        fontFamily: 'monospace',
        fontSize: 12,
        padding: 10,
        border: '1px dashed #ccc',
        borderRadius: 6,
        marginBottom: 12,
      }}
    >
      <strong>[Test] Tạo Task nhanh:</strong>

      <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={{ padding: 4 }}>
        <option value="">-- Chọn xe --</option>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.license_plate}
          </option>
        ))}
      </select>

      <select value={loaiTask} onChange={(e) => setLoaiTask(e.target.value)} style={{ padding: 4 }}>
        {TASK_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <select value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)} style={{ padding: 4 }}>
        <option value="">Từ (tuỳ chọn)</option>
        {depots.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>

      <select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)} style={{ padding: 4 }}>
        <option value="">Đến (tuỳ chọn)</option>
        {stations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>

      <button type="submit" disabled={loading} style={{ padding: '4px 10px', cursor: 'pointer' }}>
        {loading ? 'Đang tạo...' : 'Tạo'}
      </button>

      {message && (
        <span style={{ color: message.type === 'success' ? 'green' : 'red' }}>{message.text}</span>
      )}
    </form>
  );
}
