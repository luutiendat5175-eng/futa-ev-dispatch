import type { UserRole } from '@/domain/task/taskStateMachine';

export type PermissionAction =
  | 'import_bang_tuyen_sheet' | 'tinh_lct_kiem_tra_loi' | 'xuat_danh_sach_xe'
  | 'xem_toan_bo_map' | 'tao_dieu_phoi_task' | 'cap_nhat_trang_thai_task'
  | 'rollback_trang_thai' | 'chup_anh_doi_soat' | 'xem_lich_su_task'
  | 'xem_xuat_kpi' | 'cham_cong_hom_nay' | 'cham_cong_nhieu_ngay_export'
  | 'cau_hinh_tham_so_lct' | 'quan_tri_nguoi_dung' | 'tao_ca_lam_viec';

const roles: UserRole[] = ['admin', 'dieu_phoi', 'dieu_do', 'lai_xe'];
const MATRIX: Record<PermissionAction, Record<UserRole, boolean>> = {
  import_bang_tuyen_sheet: { admin: true, dieu_phoi: false, dieu_do: true, lai_xe: false },
  tinh_lct_kiem_tra_loi: { admin: true, dieu_phoi: false, dieu_do: true, lai_xe: false },
  xuat_danh_sach_xe: { admin: true, dieu_phoi: true, dieu_do: true, lai_xe: true },
  xem_toan_bo_map: { admin: true, dieu_phoi: true, dieu_do: false, lai_xe: false },
  tao_dieu_phoi_task: { admin: true, dieu_phoi: true, dieu_do: false, lai_xe: false },
  cap_nhat_trang_thai_task: { admin: true, dieu_phoi: true, dieu_do: false, lai_xe: true },
  rollback_trang_thai: { admin: true, dieu_phoi: true, dieu_do: false, lai_xe: false },
  chup_anh_doi_soat: { admin: true, dieu_phoi: true, dieu_do: false, lai_xe: true },
  xem_lich_su_task: { admin: true, dieu_phoi: true, dieu_do: true, lai_xe: true },
  xem_xuat_kpi: { admin: true, dieu_phoi: true, dieu_do: true, lai_xe: true },
  cham_cong_hom_nay: { admin: true, dieu_phoi: true, dieu_do: false, lai_xe: true },
  cham_cong_nhieu_ngay_export: { admin: true, dieu_phoi: true, dieu_do: false, lai_xe: false },
  cau_hinh_tham_so_lct: { admin: true, dieu_phoi: true, dieu_do: false, lai_xe: false },
  quan_tri_nguoi_dung: { admin: true, dieu_phoi: false, dieu_do: false, lai_xe: false },
  tao_ca_lam_viec: { admin: true, dieu_phoi: true, dieu_do: false, lai_xe: false },
};

export const canPerform = (role: UserRole, action: PermissionAction) => MATRIX[action][role];
export const listAllPermissionEntries = () =>
  (Object.keys(MATRIX) as PermissionAction[]).flatMap((action) => roles.map((role) => ({ action, role })));
