'use client';

import { useEffect, useMemo, useState } from 'react';
import { authFetch } from '@/infrastructure/auth/authFetch';
import { DepotMultiFilter } from './DepotMultiFilter';
import { rosterDepotOptions } from './rosterDepotOptions';
import styles from './DutyRosterBoard.module.css';

type Row = {
  depotId: string | null;
  depotName: string;
  scheduleId: string;
  sequence: number | null;
  departureAt: string;
  licensePlate: string;
  priority: number;
  chargingStation: string;
  location: string;
};
type End = { name: string; rows: Row[] };
type Route = { routeCode: string; routeName: string; ends: End[] };
type DetailRow = Row & { routeCode: string; routeEndName: string };
type BalanceGroup = { key: string; location: string; depotName: string; rows: DetailRow[] };

const locations = ['Trạm sạc', 'Đang về sạc', 'Đang trả xe', 'Đã sạc', 'Chưa nhận'] as const;
const formatTime = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));
const locationClass = (location: string) => location === 'Đã sạc' ? 'roster-charged' : location === 'Chưa nhận' ? 'roster-waiting' : location === 'Đang về sạc' ? 'roster-outbound' : location === 'Đang trả xe' ? 'roster-returning' : '';

export function DutyRosterBoard({ query }: { query: string }) {
  const [depotFilter, setDepotFilter] = useState<string[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [role, setRole] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [stationFilter, setStationFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [rosterResponse, actorResponse] = await Promise.all([
          authFetch('/api/v1/dashboard/roster'), authFetch('/api/v1/me'),
        ]);
        const roster = await rosterResponse.json();
        if (!active) return;
        if (!rosterResponse.ok) throw new Error(roster.error?.message ?? 'Không tải được Bảng tài.');
        setRoutes(roster.routes ?? []);
        if (actorResponse.ok) {
          const actor = await actorResponse.json();
          if (active) setRole(actor?.role ?? '');
        }
        setError('');
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Không tải được Bảng tài.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const stations = useMemo(() => [...new Set(routes.flatMap((route) => route.ends.flatMap((end) => end.rows.map((row) => row.chargingStation))).filter(Boolean))].sort(), [routes]);
  const depots = useMemo(() => rosterDepotOptions(routes.flatMap((route) => route.ends.flatMap((end) => end.rows)), stationFilter), [routes, stationFilter]);
  const matchesBase = (row: Row, routeCode: string) =>
    (!depotFilter.length || (row.depotId !== null && depotFilter.includes(row.depotId))) &&
    (!stationFilter || row.chargingStation === stationFilter) &&
    (!query || `${row.licensePlate} ${routeCode} ${row.chargingStation} ${row.depotName}`.toLowerCase().includes(query.toLowerCase()));
  const matches = (row: Row, routeCode: string) => matchesBase(row, routeCode) && (!locationFilter || row.location === locationFilter);

  const scopedRows = useMemo<DetailRow[]>(() => routes.flatMap((route) =>
    (!routeFilter || route.routeCode === routeFilter)
      ? route.ends.flatMap((end) => end.rows.filter((row) => matchesBase(row, route.routeCode)).map((row) => ({ ...row, routeCode: route.routeCode, routeEndName: end.name })))
      : [],
  ), [routes, routeFilter, stationFilter, query, depotFilter]);

  const detailRows = useMemo(() => scopedRows.filter((row) => !locationFilter || row.location === locationFilter), [scopedRows, locationFilter]);

  const filtered = useMemo(() => routes
    .filter((route) => !routeFilter || route.routeCode === routeFilter)
    .map((route) => ({
      ...route,
      ends: route.ends.map((end) => ({ ...end, rows: end.rows.filter((row) => matches(row, route.routeCode)) })).filter((end) => end.rows.length),
    }))
    .filter((route) => route.ends.length), [routes, routeFilter, stationFilter, locationFilter, query, depotFilter]);

  const statusCounts = useMemo(() => new Map(locations.map((location) => [location, scopedRows.filter((row) => row.location === location).length])), [scopedRows]);
  const balanceGroups = useMemo<BalanceGroup[]>(() => {
    const groups = new Map<string, BalanceGroup>();
    for (const row of detailRows) {
      const key = `${row.location}:${row.depotId ?? 'unknown'}`;
      const group = groups.get(key) ?? { key, location: row.location, depotName: row.depotName, rows: [] };
      group.rows.push(row);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => locations.indexOf(a.location as typeof locations[number]) - locations.indexOf(b.location as typeof locations[number]) || a.depotName.localeCompare(b.depotName, 'vi'));
  }, [detailRows]);

  return <section className="roster-panel">
    <div className="roster-heading">
      <h2>Xem theo bảng tài</h2>
      <p>Vàng: chưa nhận · Xanh lá: đã sạc · Xanh dương: đang về sạc · Cam: đang trả xe.</p>
      {role === 'admin' && <div className="roster-filters">
        <label>Tuyến<select value={routeFilter} onChange={(event) => setRouteFilter(event.target.value)}><option value="">Tất cả tuyến</option>{routes.map((route) => <option key={route.routeCode} value={route.routeCode}>Tuyến {route.routeCode}</option>)}</select></label>
        <label>Trạm sạc<select value={stationFilter} onChange={(event) => { setStationFilter(event.target.value); setDepotFilter([]); setExpandedGroup(null); }}><option value="">Tất cả trạm</option>{stations.map((station) => <option key={station} value={station}>{station}</option>)}</select></label>
      </div>}
    </div>
    <DepotMultiFilter options={depots} selected={depotFilter} onChange={(ids) => { setDepotFilter(ids); setExpandedGroup(null); }} />
    <section className={styles.balance} aria-labelledby="roster-balance-title">
      <div className={styles.balanceHeading}>
        <div><h3 id="roster-balance-title">Cân đối xe theo vị trí</h3><p>{stationFilter ? `Trạm ${stationFilter}` : 'Tất cả trạm trong phạm vi được cấp quyền'} · {detailRows.length} xe phù hợp</p></div>
        <button type="button" className={locationFilter === '' ? styles.active : ''} onClick={() => { setLocationFilter(''); setExpandedGroup(null); }}>Tất cả ({detailRows.length})</button>
      </div>
      <div className={styles.statusFilters} aria-label="Lọc theo trạng thái xe">
        {locations.map((location) => <button key={location} type="button" className={locationFilter === location ? styles.active : ''} onClick={() => { setLocationFilter(location); setExpandedGroup(null); }}>{location} ({statusCounts.get(location) ?? 0})</button>)}
      </div>
      <div className={styles.balanceGrid}>
        {balanceGroups.map((group) => <article className={styles.balanceCard} key={group.key}>
          <header><span>{group.location}</span><strong>{group.rows.length} xe</strong></header>
          <p>Bãi gốc: <b>{group.depotName}</b></p>
          <button type="button" className={styles.detailToggle} onClick={() => setExpandedGroup((current) => current === group.key ? null : group.key)}>{expandedGroup === group.key ? 'Ẩn chi tiết' : 'Xem xe và tuyến'}</button>
          {expandedGroup === group.key && <div className={styles.detailList}>
            {group.rows.map((row) => <div key={row.scheduleId}><b>{row.licensePlate}</b><span>Tuyến {row.routeCode} · {row.routeEndName} · STT {row.sequence ?? '—'} · XB {formatTime(row.departureAt)}</span></div>)}
          </div>}
        </article>)}
      </div>
      {!balanceGroups.length && !loading && <p className={styles.empty}>Không có xe phù hợp với bộ lọc hiện tại.</p>}
    </section>
    {error && <p className="dashboard-error">{error}</p>}
    {loading ? <p>Đang tải Bảng tài…</p> : <div className="roster-scroll">
      {filtered.map((route) => <section className="route-table" key={route.routeCode}><h3>Tuyến {route.routeCode}</h3>{route.ends.map((end, endIndex) => <div key={`${end.name}-${endIndex}`}><h4>{end.name}</h4><table><thead><tr><th>STT</th><th>Giờ XB</th><th>BSX</th><th>Ưu tiên</th><th>Trạm sạc</th><th>Vị trí hiện tại</th></tr></thead><tbody>{end.rows.map((row, index) => <tr key={row.scheduleId} className={locationClass(row.location)}><td>{row.sequence ?? index + 1}</td><td>{formatTime(row.departureAt)}</td><td>{row.licensePlate}</td><td>Ưu tiên {row.priority}</td><td>{row.chargingStation}</td><td>{row.location}</td></tr>)}</tbody></table></div>)}</section>)}
      {!filtered.length && <p>Không có xe phù hợp với bộ lọc.</p>}
    </div>}
  </section>;
}
