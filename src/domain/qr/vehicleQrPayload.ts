/**
 * Định dạng nội dung mã QR dán trên xe: "EVDISPATCH:VEHICLE:{vehicleId}:{bienSo}"
 * Có tiền tố "EVDISPATCH:VEHICLE:" để phân biệt với các QR khác (vd QR quảng cáo,
 * QR wifi...) có thể vô tình bị quét nhầm - tránh nhận nhầm dữ liệu rác thành xe hợp lệ.
 * Gồm cả vehicleId (để tra chính xác) và bienSo (để hiển thị ngay không cần gọi API).
 */
const QR_PREFIX = 'EVDISPATCH:VEHICLE:';

export interface VehicleQrPayload {
  vehicleId: string;
  bienSo: string;
}

export function encodeVehicleQrPayload(payload: VehicleQrPayload): string {
  return `${QR_PREFIX}${payload.vehicleId}:${payload.bienSo}`;
}

/**
 * Giải mã nội dung quét được từ camera. Trả về null nếu KHÔNG phải QR xe hợp lệ
 * của hệ thống này (vd quét nhầm QR khác) - tầng gọi phải tự xử lý case null,
 * không được giả định luôn parse thành công.
 */
export function decodeVehicleQrPayload(scannedText: string): VehicleQrPayload | null {
  if (!scannedText.startsWith(QR_PREFIX)) return null;

  const rest = scannedText.slice(QR_PREFIX.length);
  const separatorIndex = rest.indexOf(':');
  if (separatorIndex === -1) return null;

  const vehicleId = rest.slice(0, separatorIndex);
  const bienSo = rest.slice(separatorIndex + 1);

  if (!vehicleId || !bienSo) return null;

  return { vehicleId, bienSo };
}

