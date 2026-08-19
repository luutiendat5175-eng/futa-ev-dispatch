'use client';

import { useEffect, useState } from 'react';
import { groupTasksIntoKanbanColumns, isTaskOverdue, type KanbanTask } from '@/domain/task/groupTasksIntoKanbanColumns';
import { TaskProofAction } from './TaskProofAction';
import type { UserRole } from '@/domain/task/taskStateMachine';

const time = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
export function TaskKanbanBoard({ tasks, scope, actor }: { tasks: KanbanTask[]; scope: 'di_chuyen' | 'auxiliary'; actor: { userId: string; role: UserRole; fullName: string } | null }) {
  const [now, setNow] = useState(() => new Date()); useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id); }, []);
  return <div className="kanban-scroll">{groupTasksIntoKanbanColumns(tasks, scope).map((column, index) => { const accent = ['#64748b', '#2563eb', '#0d9488', '#ea580c'][index]; return <section key={column.status} className="kanban-column"><header><span className="kanban-dot" style={{ background: accent }} />{column.label}<span className="kanban-count" style={{ background: accent }}>{column.tasks.length}</span></header><div className="kanban-cards">{column.tasks.map((task) => { const overdue = isTaskOverdue(task, now); return <article key={task.id} className={overdue ? 'task-card overdue' : 'task-card'}><strong className="task-plate">{task.vehiclePlate ?? 'Chưa có biển số'}</strong><div className="task-details"><span>Tuyến {task.routeCode ?? '—'}</span><span>Giờ XB: {time(task.departureAt)}</span><b className="task-roster-order">Thứ tự tài: {task.sequence ?? '—'}</b></div>{overdue && <p className="task-overdue">Quá ETA</p>}<TaskProofAction taskId={task.id} status={task.trangThai} assignedUserId={task.assignedUserId} actor={actor} vehiclePlate={task.vehiclePlate ?? null} /></article>; })}{column.tasks.length === 0 && <p className="task-empty">Chưa có xe</p>}</div></section>; })}</div>;
}
