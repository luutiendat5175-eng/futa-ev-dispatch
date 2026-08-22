'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { authFetch } from '@/infrastructure/auth/authFetch';
import { encodeVehicleQrPayload } from '@/domain/qr/vehicleQrPayload';

type Vehicle = { id: string; license_plate: string; vehicle_type_code: string | null };
const qrUrl = (payload: string) => `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=8&format=svg&data=${encodeURIComponent(payload)}`;

export default function QrLabelsPage() {
  const router = useRouter(); const [vehicles, setVehicles] = useState<Vehicle[]>([]); const [query, setQuery] = useState(''); const [selected, setSelected] = useState<string[]>([]); const [notice, setNotice] = useState(''); const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    authFetch('/api/v1/me').then((response) => response.json()).then((actor) => {
      if (actor.role === 'lai_xe') { router.replace('/dashboard'); return; }
      setAllowed(true); return authFetch('/api/v1/vehicles').then((response) => response.json()).then((data) => setVehicles(data.vehicles ?? []));
    }).catch(() => setNotice('Không tải được danh sách xe.'));
  }, [router]);
  const visible = useMemo(() => vehicles.filter((vehicle) => `${vehicle.license_plate} ${vehicle.vehicle_type_code ?? ''}`.toLowerCase().includes(query.toLowerCase())), [vehicles, query]); const labels = vehicles.filter((vehicle) => selected.includes(vehicle.id));
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  if (!allowed) return <AppShell><main className="qr-page"><p>Đang kiểm tra quyền truy cập…</p></main></AppShell>;
  return <AppShell><main className="qr-page"><header><div><p className="workspace-eyebrow">EV DISPATCH</p><h1>Nhãn QR xe</h1><p>Tạo nhãn nhận diện xe để quét khi giao nhận. QR chỉ chứa mã xe nội bộ và biển số.</p></div><button className="qr-print" disabled={!labels.length} onClick={() => window.print()}>In {labels.length || ''} nhãn</button></header><section className="qr-tools no-print"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm biển số hoặc loại xe…"/><button onClick={() => setSelected(visible.map((vehicle) => vehicle.id))}>Chọn kết quả</button><button onClick={() => setSelected([])}>Bỏ chọn</button></section>{notice && <p className="qr-notice">{notice}</p>}<section className="qr-select-list no-print">{visible.map((vehicle) => <label key={vehicle.id}><input type="checkbox" checked={selected.includes(vehicle.id)} onChange={() => toggle(vehicle.id)} /><b>{vehicle.license_plate}</b><span>{vehicle.vehicle_type_code ?? 'Chưa gán loại xe'}</span></label>)}{!visible.length && <p>Không tìm thấy xe phù hợp.</p>}</section><section className="qr-label-grid">{labels.map((vehicle) => { const payload = encodeVehicleQrPayload({ vehicleId: vehicle.id, bienSo: vehicle.license_plate }); return <article key={vehicle.id} className="qr-label"><strong>EV DISPATCH</strong><img src={qrUrl(payload)} alt={`Mã QR xe ${vehicle.license_plate}`} /><b>{vehicle.license_plate}</b><span>{vehicle.vehicle_type_code ?? '—'}</span></article>; })}{!labels.length && <p className="qr-empty no-print">Chọn xe bên trên để xem nhãn trước khi in.</p>}</section></main></AppShell>;
}
