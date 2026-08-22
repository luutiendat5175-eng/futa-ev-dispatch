import type { UserRole } from './taskStateMachine';
import { ForbiddenRollbackError, InvalidTransitionError } from './taskStateMachine';

/**
 * Task phụ (hỗ trợ, kiểm tra, vệ sinh, điều động, phát sinh) dùng quy trình
 * ĐƠN GIẢN 3 bước, TÁCH RIÊNG khỏi TASK_STATUS_ORDER 6 bước của Task di chuyển xe -
 * đúng yêu cầu thiết kế "task phụ dùng state đơn giản riêng".
 *
 * Giả định về rollback (CẦN XÁC NHẬN LẠI VỚI NGHIỆP VỤ nếu khác): áp dụng CÙNG
 * quy tắc như Task di chuyển - chỉ Quản lý/Admin được rollback, nhân viên chỉ
 * được tiến. Nếu nghiệp vụ muốn khác (vd cho nhân viên tự rollback task phụ vì
 * ít rủi ro hơn task di chuyển xe), sửa lại assertValidAuxiliaryTransition().
 */
export type AuxiliaryTaskStatus = 'moi' | 'dang_xu_ly' | 'hoan_thanh';

export const AUXILIARY_STATUS_ORDER: AuxiliaryTaskStatus[] = ['moi', 'dang_xu_ly', 'hoan_thanh'];

export function advanceAuxiliary(current: AuxiliaryTaskStatus): AuxiliaryTaskStatus {
  const idx = AUXILIARY_STATUS_ORDER.indexOf(current);
  if (idx === -1 || idx === AUXILIARY_STATUS_ORDER.length - 1) {
    throw new InvalidTransitionError(current, current);
  }
  return AUXILIARY_STATUS_ORDER[idx + 1];
}

export function rollbackAuxiliary(
  current: AuxiliaryTaskStatus,
  actorRole: UserRole,
): AuxiliaryTaskStatus {
  if (actorRole !== 'dieu_phoi' && actorRole !== 'admin') {
    throw new ForbiddenRollbackError(actorRole);
  }
  const idx = AUXILIARY_STATUS_ORDER.indexOf(current);
  if (idx <= 0) {
    throw new InvalidTransitionError(current, current);
  }
  return AUXILIARY_STATUS_ORDER[idx - 1];
}

export function assertValidAuxiliaryTransition(
  from: AuxiliaryTaskStatus,
  to: AuxiliaryTaskStatus,
  actorRole: UserRole,
): void {
  const fromIdx = AUXILIARY_STATUS_ORDER.indexOf(from);
  const toIdx = AUXILIARY_STATUS_ORDER.indexOf(to);

  if (toIdx === fromIdx + 1) return; // tiến đúng 1 bước
  if (toIdx === fromIdx - 1) {
    if (actorRole !== 'dieu_phoi' && actorRole !== 'admin') {
      throw new ForbiddenRollbackError(actorRole);
    }
    return;
  }
  throw new InvalidTransitionError(from, to);
}
