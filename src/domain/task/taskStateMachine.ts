export type TaskStatus =
  | 'chua_sac' | 'nhan_xe_dau_ben' | 'giao_tram_sac' | 'doi_sac'
  | 'nhan_tram_sac' | 'giao_dau_ben' | 'hoan_thanh';

export type UserRole = 'admin' | 'dieu_phoi' | 'dieu_do' | 'lai_xe';
export type TaskType = 'di_chuyen' | 'ho_tro' | 'kiem_tra' | 've_sinh' | 'dieu_dong' | 'phat_sinh';

export const TASK_STATUS_ORDER: TaskStatus[] = [
  'chua_sac', 'nhan_xe_dau_ben', 'giao_tram_sac', 'doi_sac',
  'nhan_tram_sac', 'giao_dau_ben', 'hoan_thanh',
];

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`TASK_INVALID_TRANSITION: cannot move from "${from}" to "${to}"`);
    this.name = 'InvalidTransitionError';
  }
}

export class ForbiddenRollbackError extends Error {
  constructor(role: UserRole) {
    super(`TASK_ROLLBACK_FORBIDDEN: "${role}" cannot roll back a task`);
    this.name = 'ForbiddenRollbackError';
  }
}

export function advance(current: TaskStatus): TaskStatus {
  const index = TASK_STATUS_ORDER.indexOf(current);
  if (index < 0 || index === TASK_STATUS_ORDER.length - 1) throw new InvalidTransitionError(current, current);
  return TASK_STATUS_ORDER[index + 1];
}

export function rollback(current: TaskStatus, role: UserRole): TaskStatus {
  if (role !== 'admin') throw new ForbiddenRollbackError(role);
  const index = TASK_STATUS_ORDER.indexOf(current);
  if (index <= 0) throw new InvalidTransitionError(current, current);
  return TASK_STATUS_ORDER[index - 1];
}

export function assertValidTransition(from: TaskStatus, to: TaskStatus, role: UserRole): void {
  const fromIndex = TASK_STATUS_ORDER.indexOf(from);
  const toIndex = TASK_STATUS_ORDER.indexOf(to);
  if (toIndex === fromIndex + 1) return;
  if (toIndex === fromIndex - 1 && role === 'admin') return;
  if (toIndex === fromIndex - 1) throw new ForbiddenRollbackError(role);
  throw new InvalidTransitionError(from, to);
}
