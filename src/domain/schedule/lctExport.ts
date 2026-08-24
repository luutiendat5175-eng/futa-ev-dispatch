export type LctExportItem = {
  id: string;
  status: string;
  vehiclePlate: string | null;
  vehicleTypeCode: string | null;
  routeCode: string | null;
  rosterSequence: number | null;
  departureAt: string | null;
  priorityLctAt: string | null;
  stationId: string | null;
  stationName: string | null;
};

type Cell = string | number;

const chargedStatuses = new Set(['giao_dau_ben', 'hoan_thanh']);

function countByVehicleType(items: LctExportItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const type = item.vehicleTypeCode?.trim() || 'Chưa xác định';
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right, 'vi', { numeric: true }));
}

function summaryRows(label: string, items: LctExportItem[]): Cell[][] {
  const types = countByVehicleType(items);
  if (!types.length) return [[label, '0 xe', '', '']];
  return types.map(([type, count], index) => [index === 0 ? label : '', index === 0 ? `${items.length} xe` : '', type, `${count} xe`]);
}

export function buildLctExportRows(items: LctExportItem[], formatTime: (value: string | null) => string, statusLabel: Record<string, string>): Cell[][] {
  const priority = new Map<string, number>();
  const stationGroups = new Map<string, LctExportItem[]>();
  for (const item of items) {
    const key = item.stationId ?? '__unknown_station__';
    stationGroups.set(key, [...(stationGroups.get(key) ?? []), item]);
  }
  for (const stationItems of stationGroups.values()) {
    stationItems.sort((left, right) => {
      const leftTime = left.priorityLctAt ? new Date(left.priorityLctAt).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.priorityLctAt ? new Date(right.priorityLctAt).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime || left.id.localeCompare(right.id);
    }).forEach((item, index) => priority.set(item.id, index + 1));
  }

  const charged = items.filter((item) => chargedStatuses.has(item.status));
  const uncharged = items.filter((item) => !chargedStatuses.has(item.status));
  const details = items.slice().sort((left, right) =>
    (left.stationName ?? '').localeCompare(right.stationName ?? '', 'vi', { numeric: true })
      || (priority.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (priority.get(right.id) ?? Number.MAX_SAFE_INTEGER));

  return [
    ['TỔNG HỢP TRẠNG THÁI SẠC'],
    ['Hạng mục', 'Tổng số xe', 'Dòng xe', 'Số lượng'],
    ...summaryRows('Đã sạc', charged),
    ...summaryRows('Chưa sạc', uncharged),
    [],
    ['DANH SÁCH LCT'],
    ['Biển số', 'Tuyến', 'STT bảng tài', 'Thứ tự ưu tiên', 'Trạm sạc', 'Giờ xuất bến (giờ VN)', 'LCT bắt đầu điều chuyển (giờ VN)', 'Trạng thái'],
    ...details.map((item) => [
      item.vehiclePlate ?? '',
      item.routeCode ?? '',
      item.rosterSequence ?? '',
      priority.get(item.id) ?? '',
      item.stationName ?? '',
      formatTime(item.departureAt),
      formatTime(item.priorityLctAt),
      statusLabel[item.status] ?? item.status,
    ]),
  ];
}
