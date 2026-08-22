'use client';

import { useState } from 'react';
import { QrScanner } from '@/components/qr/QrScanner';
import { authFetch } from '@/infrastructure/auth/authFetch';
import { TaskProofAction } from './TaskProofAction';
import type { UserRole } from '@/domain/task/taskStateMachine';

type Task = { id: string; status: string; assignedUserId: string | null; licensePlate: string; routeCode: string; routeEndName: string; sequence: number | null; priority: number | null; departureAt: string | null };
const time = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';

export function QrReceiveFlow({ actor }: { actor: { userId: string; role: UserRole; fullName: string } | null }) {
  const [open, setOpen] = useState(false); const [task, setTask] = useState<Task | null>(null); const [message, setMessage] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const scan = async (payload: { vehicleId: string }) => { setOpen(false); setMessage('Đang kiểm tra task…'); const response = await authFetch(`/api/v1/qr/vehicle-task?vehicleId=${encodeURIComponent(payload.vehicleId)}`); const data = await response.json(); if (!response.ok) { setTask(null); setMessage(data.error?.message ?? 'Không tìm thấy task.'); return; } setTask(data.task); setConfirmed(false); setMessage(''); };
  const scanAgain = () => { setTask(null); setConfirmed(false); setOpen(true); };
  return <div className="qr-flow"><button className="qr-scan-button" onClick={() => { setTask(null); setConfirmed(false); setMessage(''); setOpen(true); }}>Quét QR nhận xe</button>{open && <QrScanner onScan={scan} onClose={() => setOpen(false)} />}{message && <span>{message}</span>}{task && <div className="qr-task-modal"><div><button className="qr-close" onClick={() => setTask(null)}>×</button><p className="workspace-eyebrow">XÁC NHẬN XE</p><div className="qr-plate-line"><h2>{task.licensePlate}</h2><b className="qr-priority">Ưu tiên {task.priority ?? '—'}</b></div><p>Tuyến {task.routeCode} · {task.routeEndName}</p><p>STT bảng tài: <b>{task.sequence ?? '—'}</b> · Giờ xuất bến: <b>{time(task.departureAt)}</b></p>{task.status === 'chua_sac' && !task.assignedUserId ? (confirmed ? <TaskProofAction taskId={task.id} status={task.status} assignedUserId={task.assignedUserId} actor={actor} vehiclePlate={task.licensePlate} startPhotoPicker autoOpenCamera claimOnSubmit onSuccess={() => { setTask(null); setMessage('Đã nhận xe và lưu ảnh.'); }} /> : <div className="qr-confirm-actions"><button className="qr-scan-button" onClick={() => setConfirmed(true)}>Xác nhận nhận xe</button><button onClick={scanAgain}>Hủy / quét lại</button></div>) : task.assignedUserId === actor?.userId ? <TaskProofAction taskId={task.id} status={task.status} assignedUserId={task.assignedUserId} actor={actor} vehiclePlate={task.licensePlate} startPhotoPicker /> : <p>Task đã được nhận bởi nhân viên khác.</p>}</div></div>}</div>;
}
