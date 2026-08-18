'use client';

import { useEffect, useRef, useState } from 'react';
import type { YardLocation } from '@/components/yard-map/YardMapCanvas';

type Staff = { vehiclePlate: string; employeeName: string; occurredAt: string; stationId?: string; depotId?: string; kind: 'outbound' | 'station' | 'inbound' | 'depot'; isLate?: boolean; dueAt?: string };
type LeafletMap = { setView: (center: [number, number], zoom: number) => LeafletMap; remove: () => void; addLayer: (layer: unknown) => void };
type LeafletLayerGroup = { clearLayers: () => void };
type LeafletApi = { map: (node: HTMLElement) => LeafletMap; tileLayer: (url: string, options: Record<string, string>) => { addTo: (map: LeafletMap) => void }; layerGroup: () => LeafletLayerGroup; circleMarker: (point: [number, number], options: Record<string, string | number>) => { addTo: (layer: LeafletLayerGroup) => { bindPopup: (html: string) => void } }; polyline: (points: [number, number][], options: Record<string, string | number>) => { addTo: (layer: LeafletLayerGroup) => { bindPopup: (html: string) => void } } };
declare global { interface Window { L?: LeafletApi } }

const loadLeaflet = () => new Promise<void>((resolve, reject) => {
  if (window.L) return resolve();
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.append(css);
  const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.onload = () => resolve(); script.onerror = () => reject(new Error('Leaflet load failed')); document.head.append(script);
});
const clock = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
// Leaflet's base polyline has no offset feature.  Shift each direction to an
// opposite side of the depot-to-station axis so both are individually clickable.
function parallelPath(depot: YardLocation, station: YardLocation, side: 1 | -1, outbound: boolean): [number, number][] {
  const latitudeDelta = station.x - depot.x; const longitudeDelta = station.y - depot.y;
  const length = Math.hypot(latitudeDelta, longitudeDelta) || 1;
  const shift = 0.0011; const latitudeOffset = (-longitudeDelta / length) * shift * side; const longitudeOffset = (latitudeDelta / length) * shift * side;
  const depotPoint: [number, number] = [depot.x + latitudeOffset, depot.y + longitudeOffset]; const stationPoint: [number, number] = [station.x + latitudeOffset, station.y + longitudeOffset];
  return outbound ? [depotPoint, stationPoint] : [stationPoint, depotPoint];
}

export function StreetOperationsMap({ depots, stations, staffLocations }: { depots: YardLocation[]; stations: YardLocation[]; staffLocations: Staff[] }) {
  const element = useRef<HTMLDivElement>(null); const map = useRef<LeafletMap | null>(null); const layers = useRef<LeafletLayerGroup | null>(null); const [ready, setReady] = useState(false);

  // Mount once. Later updates redraw data only, preserving the operator's zoom,
  // pan and visible viewport instead of returning to the default extent.
  useEffect(() => { let cancelled = false; void loadLeaflet().then(() => {
    if (cancelled || !element.current || map.current || !window.L) return;
    const all = [...depots, ...stations];
    if (!all.length) { element.current.textContent = 'Chưa có bãi/trạm trong phạm vi được phân công.'; return; }
    map.current = window.L.map(element.current).setView([all[0].x, all[0].y], 11);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map.current);
    layers.current = window.L.layerGroup(); map.current.addLayer(layers.current); setReady(true);
  }).catch(() => { if (element.current) element.current.textContent = 'Không tải được bản đồ đường phố.'; }); return () => { cancelled = true; }; }, [depots, stations]);

  useEffect(() => {
    const L = window.L; if (!ready || !L || !layers.current) return;
    layers.current.clearLayers();
    const all = [...depots, ...stations]; const ids = new Map(all.map((item) => [item.id, item]));
    const detail = (rows: Staff[]) => rows.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((item) => `${item.vehiclePlate} · ${item.employeeName} · <span style="color:${item.isLate ? '#dc2626' : '#111827'};font-weight:${item.isLate ? '700' : '400'}">${clock(item.occurredAt)}</span>`).join('<br/>') || 'Không có nhân viên';
    for (const item of all) {
      const isStation = stations.some((station) => station.id === item.id);
      const rows = staffLocations.filter((staff) => isStation ? staff.kind === 'station' && staff.stationId === item.id : staff.kind === 'depot' && staff.depotId === item.id);
      L.circleMarker([item.x, item.y], { radius: 10, color: isStation ? '#c2410c' : '#0f766e', fillOpacity: 0.9 }).addTo(layers.current).bindPopup(`<b>${item.name}</b><br/>${detail(rows)}`);
    }
    const routes = new Map<string, Staff[]>();
    for (const staff of staffLocations.filter((item) => item.kind === 'outbound' || item.kind === 'inbound')) {
      if (!staff.depotId || !staff.stationId) continue;
      const key = `${staff.kind}:${staff.depotId}:${staff.stationId}`; routes.set(key, [...(routes.get(key) ?? []), staff]);
    }
    for (const [key, routeStaff] of routes) {
      const [kind, depotId, stationId] = key.split(':'); const depot = ids.get(depotId); const station = ids.get(stationId); if (!depot || !station) continue;
      const outbound = kind === 'outbound'; const points = parallelPath(depot, station, outbound ? 1 : -1, outbound);
      L.polyline(points, { color: outbound ? '#16a34a' : '#dc2626', weight: 6, dashArray: outbound ? '' : '12 9', opacity: 0.9 }).addTo(layers.current).bindPopup(`<b>${outbound ? 'Chiều đi bãi → trạm' : 'Chiều về trạm → bãi'}</b><br/>${detail(routeStaff)}`);
    }
  }, [depots, stations, staffLocations, ready]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);
  return <div ref={element} className="leaflet-map" />;
}
