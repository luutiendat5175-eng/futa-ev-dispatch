export interface DashboardLocationFilter {
  /** null = "Tất cả bãi" (không lọc) */
  depotId: string | null;
  /** null = "Tất cả trạm" (không lọc) */
  stationId: string | null;
}

export interface FilterableLocation {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface FilterableTask {
  fromLocationId: string | null;
  toLocationId: string | null;
}

/**
 * Lọc danh sách Bãi/Trạm hiển thị trên Yard Map theo bộ lọc đang chọn.
 * Chọn "Tất cả" (null) -> giữ nguyên toàn bộ danh sách.
 * Chọn 1 bãi/trạm cụ thể -> CHỈ hiển thị đúng địa điểm đó trên map.
 */
export function filterLocationsForMap(
  depots: FilterableLocation[],
  stations: FilterableLocation[],
  filter: DashboardLocationFilter,
): { depots: FilterableLocation[]; stations: FilterableLocation[] } {
  return {
    depots: filter.depotId ? depots.filter((d) => d.id === filter.depotId) : depots,
    stations: filter.stationId ? stations.filter((s) => s.id === filter.stationId) : stations,
  };
}

/**
 * 1 Task khớp bộ lọc nếu địa điểm ĐI hoặc ĐẾN của Task trùng với bãi/trạm đang lọc
 * (Task có thể đi từ Bãi -> Trạm hoặc Trạm -> Bãi, nên phải kiểm tra cả 2 chiều).
 * Nếu bộ lọc để "Tất cả" ở cả 2 (depotId=null, stationId=null) -> mọi Task đều khớp.
 * Nếu chọn CẢ bãi và trạm cùng lúc -> Task phải khớp CẢ HAI điều kiện (AND).
 */
export function taskMatchesLocationFilter(
  task: FilterableTask,
  filter: DashboardLocationFilter,
): boolean {
  const matchesDepot =
    !filter.depotId ||
    task.fromLocationId === filter.depotId ||
    task.toLocationId === filter.depotId;

  const matchesStation =
    !filter.stationId ||
    task.fromLocationId === filter.stationId ||
    task.toLocationId === filter.stationId;

  return matchesDepot && matchesStation;
}

export function filterTasksByLocation<T extends FilterableTask>(
  tasks: T[],
  filter: DashboardLocationFilter,
): T[] {
  return tasks.filter((t) => taskMatchesLocationFilter(t, filter));
}

