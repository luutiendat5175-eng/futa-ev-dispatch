import { canPerform, type PermissionAction } from '@/shared/permissions/permissionMatrix';
import type { UserRole } from '@/domain/task/taskStateMachine';

export interface SidebarMenuItem { href: string; label: string; icon: string; requiredAction: PermissionAction | null; }

export const SIDEBAR_MENU: SidebarMenuItem[] = [
  { href: '/dashboard', label: 'Điều phối', icon: '▣', requiredAction: null },
  { href: '/overview', label: 'Tổng quan', icon: '◈', requiredAction: null },
  { href: '/roster', label: 'Bảng tài', icon: '▤', requiredAction: null },
  { href: '/task-history', label: 'Lịch sử task', icon: '◷', requiredAction: 'xem_lich_su_task' },
  { href: '/kpi', label: 'KPI', icon: '◉', requiredAction: 'xem_xuat_kpi' },
  { href: '/attendance', label: 'Chấm công', icon: '◫', requiredAction: 'cham_cong_hom_nay' },
  { href: '/import-demo', label: 'Import dữ liệu', icon: '⇧', requiredAction: 'import_bang_tuyen_sheet' },
  { href: '/qr-labels', label: 'Nhãn QR xe', icon: '▤', requiredAction: 'xuat_danh_sach_xe' },
  { href: '/admin/users', label: 'Quản trị người dùng', icon: '◉', requiredAction: 'quan_tri_nguoi_dung' },
  { href: '/admin/time-rules', label: 'Thời gian điều phối', icon: '◷', requiredAction: 'quan_tri_nguoi_dung' },
];

export function getSidebarMenuForRole(role: UserRole) {
  return SIDEBAR_MENU.filter((item) => (item.href !== '/qr-labels' || role !== 'lai_xe') && (item.requiredAction === null || canPerform(role, item.requiredAction)));
}
