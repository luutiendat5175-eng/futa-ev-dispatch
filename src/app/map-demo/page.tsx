'use client';

import { useEffect, useState } from 'react';
import { YardMapCanvas, type YardLocation } from '@/components/yard-map/YardMapCanvas';

export default function MapDemoPage() {
  const [depots, setDepots] = useState<YardLocation[]>([]);
  const [stations, setStations] = useState<YardLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    fetch('/api/v1/map/yard')
      .then((res) => res.json())
      .then((data) => {
        setDepots(data.depots ?? []);
        setStations(data.stations ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ padding: 24, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ fontFamily: 'monospace', marginBottom: 8 }}>Digital Yard Map (demo)</h1>
      <p style={{ fontFamily: 'monospace', fontSize: 13, marginBottom: 12 }}>
        {loading
          ? 'Đang tải...'
          : `${depots.length} bãi, ${stations.length} trạm sạc. Cuộn chuột để zoom, kéo chuột để pan, click marker để chọn.`}
        {selected && <> — Đã chọn: <strong>{selected}</strong></>}
      </p>
      <div style={{ flex: 1, minHeight: 400 }}>
        <YardMapCanvas
          depots={depots}
          stations={stations}
          onSelectLocation={(loc) => setSelected(loc.name)}
        />
      </div>
    </div>
  );
}

