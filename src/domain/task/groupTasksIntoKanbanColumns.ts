import type { TaskType } from './taskStateMachine';
export interface KanbanTask { id: string; loaiTask: TaskType; trangThai: string; eta: string | null; priorityLctAt?: string | null; vehicleId: string | null; vehiclePlate?: string | null; routeCode?: string | null; departureAt?: string | null; sequence?: number | null; assignedUserId: string | null; }
export interface KanbanColumn { status: string; label: string; tasks: KanbanTask[]; }
const MOVE_COLUMNS: [string, string][] = [['chua_sac','Chưa nhận'],['nhan_xe_dau_ben','Đã nhận'],['giao_tram_sac','Giao trạm sạc'],['nhan_tram_sac','Trả xe']];
const AUX_COLUMNS: [string, string][] = [['moi','Mới'],['dang_xu_ly','Đang xử lý'],['hoan_thanh','Hoàn thành']];
export function groupTasksIntoKanbanColumns(tasks: KanbanTask[], scope: 'di_chuyen' | 'auxiliary'): KanbanColumn[] { const source = scope === 'di_chuyen' ? MOVE_COLUMNS : AUX_COLUMNS; return source.map(([status,label]) => ({ status, label, tasks: tasks.filter((task) => (scope === 'di_chuyen' ? task.loaiTask === 'di_chuyen' : task.loaiTask !== 'di_chuyen') && task.trangThai === status) })); }
export function isTaskOverdue(task: KanbanTask, now: Date): boolean { return Boolean(task.eta && task.trangThai !== 'hoan_thanh' && new Date(task.eta).getTime() < now.getTime()); }
