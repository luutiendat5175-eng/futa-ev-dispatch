'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '@/infrastructure/auth/authFetch';

type Counts = Record<string, number>;
type Station = { name: string; atStation: Counts; depots: { name: string; charged: Counts; waiting: Counts }[]; outbound: Counts; returning: Counts };
function CountList({ value }: { value: Counts }) {
  const items = Object.entries(value);
  return <div className="type-counts">{items.length ? items.map(([type, count]) => <span key={type}><b>{type}</b>: {count}</span>) : <span>0 xe</span>}</div>;
}

export function OperationsSummary() {
  const [stations, setStations] = useState<Station[]>([]);
  useEffect(() => {
    const load = () => authFetch('/api/v1/dashboard/summary').then((response) => response.json()).then((data) => setStations(data.stations ?? []));
    void load(); const interval = setInterval(load, 30_000); return () => clearInterval(interval);
  }, []);
  return <section className="ops-summary"><h1>Tổng quan điều phối</h1><p className="ops-intro">Số liệu theo trạm sạc, bãi đỗ liên quan và vị trí vận hành hiện tại.</p>
    {stations.map((station) => <article className="station-summary" key={station.name}><h2>{station.name}</h2><section className="station-at"><h3>Tại trạm sạc</h3><CountList value={station.atStation} /></section><div className="station-detail"><section><h3>Bãi đỗ</h3>{station.depots.map((depot) => <article className="depot-summary" key={depot.name}><strong>{depot.name}</strong><div><span>Đã sạc</span><CountList value={depot.charged} /></div><div><span>Chưa sạc</span><CountList value={depot.waiting} /></div></article>)}{!station.depots.length && <p>Chưa có bãi đỗ liên quan.</p>}</section><section className="movement-summary"><h3>Đang di chuyển</h3><article className="outbound"><strong>Đang về sạc</strong><CountList value={station.outbound} /></article><article className="returning"><strong>Đang trả xe</strong><CountList value={station.returning} /></article></section></div></article>)}
    {!stations.length && <p>Chưa có dữ liệu vận hành cho kế hoạch hiện tại.</p>}
  </section>;
}
