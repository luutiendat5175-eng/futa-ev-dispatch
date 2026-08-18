'use client';

import { useRef, useState } from 'react';
import type { UserRole } from '@/domain/task/taskStateMachine';
import { authFetch } from '@/infrastructure/auth/authFetch';
import { prepareEvidencePhotos } from '@/features/evidence/prepareEvidencePhotos';

const NEXT: Record<string, { status: string; label: string }> = {
  chua_sac: { status: 'nhan_xe_dau_ben', label: 'Nhận xe' },
  nhan_xe_dau_ben: { status: 'giao_tram_sac', label: 'Giao trạm sạc' },
  giao_tram_sac: { status: 'nhan_tram_sac', label: 'Nhận xe trạm sạc' },
  nhan_tram_sac: { status: 'giao_dau_ben', label: 'Trả xe' },
  giao_dau_ben: { status: 'hoan_thanh', label: 'Hoàn thành' },
};
const ROLLBACK = [['chua_sac', 'Chưa nhận xe'], ['nhan_xe_dau_ben', 'Đã nhận xe'], ['giao_tram_sac', 'Giao trạm sạc'], ['nhan_tram_sac', 'Nhận xe trạm sạc'], ['giao_dau_ben', 'Đã trả xe'], ['hoan_thanh', 'Hoàn thành']];

type Actor = { userId: string; role: UserRole; fullName: string } | null;

export function TaskProofAction({ taskId, status, assignedUserId, actor, vehiclePlate, startPhotoPicker = false }: { taskId: string; status: string; assignedUserId: string | null; actor: Actor; vehiclePlate: string | null; startPhotoPicker?: boolean }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const [files, setFiles] = useState<File[]>([]); const [photos, setPhotos] = useState(startPhotoPicker); const [rollback, setRollback] = useState(status); const input = useRef<HTMLInputElement>(null);
  const next = NEXT[status]; const driver = actor?.role === 'lai_xe'; const mine = !!actor && assignedUserId === actor.userId;
  const claim = async () => { setBusy(true); const r = await authFetch(`/api/v1/tasks/${taskId}/claim`, { method: 'POST' }); const b = await r.json(); setMessage(r.ok ? 'Đã nhận xe.' : b.error?.message ?? 'Không thể nhận task.'); setBusy(false); };
  const submit = () => {
    if (!files.length || !next) { setMessage('Chọn ít nhất một ảnh.'); return; }
    if (!navigator.geolocation) { setMessage('Thiết bị không hỗ trợ GPS.'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        setMessage('Đang nén và đóng dấu ảnh…');
        const prepared = await prepareEvidencePhotos(files, { personName: actor?.fullName ?? 'Nhân viên', subject: `Xe ${vehiclePlate ?? '—'}`, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
        const form = new FormData(); prepared.forEach((file) => form.append('photos', file)); form.set('nextStatus', next.status); form.set('latitude', String(position.coords.latitude)); form.set('longitude', String(position.coords.longitude)); form.set('accuracy', String(position.coords.accuracy));
        const r = await authFetch(`/api/v1/tasks/${taskId}/transition`, { method: 'POST', body: form }); const b = await r.json(); setMessage(r.ok ? `Đã lưu ${b.photoCount} ảnh.` : b.error?.message ?? 'Không thể cập nhật.'); if (r.ok) setFiles([]);
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể xử lý ảnh.'); } finally { setBusy(false); }
    }, () => { setBusy(false); setMessage('Cần cấp quyền GPS chính xác.'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };
  const doRollback = async () => { setBusy(true); const r = await authFetch(`/api/v1/tasks/${taskId}/rollback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetStatus: rollback }) }); const b = await r.json(); setMessage(r.ok ? 'Đã rollback, ảnh và lịch sử cũ vẫn được giữ.' : b.error?.message ?? 'Không thể rollback.'); setBusy(false); };
  if (!actor) return <span className="task-note">Đang xác minh phiên…</span>;
  return <div className="task-action">
    {driver && !assignedUserId && status !== 'hoan_thanh' && <button className="task-button task-button-primary" disabled={busy} onClick={claim}>Nhận task</button>}
    {driver && mine && next && (photos ? <div className="photo-picker"><input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { const selected = event.target.files; if (selected) setFiles((old) => [...old, ...Array.from(selected)]); }} /><div className="photo-list">{files.map((file, index) => <span key={`${file.name}${index}`}>{file.name}<button onClick={() => setFiles((old) => old.filter((_, item) => item !== index))}>×</button></span>)}</div><button className="task-button task-button-primary" disabled={!files.length || busy} onClick={submit}>{busy ? 'Đang gửi…' : `Xác nhận (${files.length} ảnh)`}</button></div> : <button className="task-button task-button-primary" disabled={busy} onClick={() => setPhotos(true)}>{next.label}</button>)}
    {actor.role === 'admin' && <div className="rollback-box"><select value={rollback} onChange={(event) => setRollback(event.target.value)}>{ROLLBACK.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="task-button" disabled={busy || rollback === status} onClick={doRollback}>Rollback</button></div>}
    {message && <span className="task-note">{message}</span>}
  </div>;
}
