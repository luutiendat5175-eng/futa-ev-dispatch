'use client';

import { FormEvent, useState } from 'react';
import { authFetch } from '@/infrastructure/auth/authFetch';

type Card = { title: string; endpoint: string; columns: string; sample?: string; exportPath?: string; templatePath?: string; roster?: boolean; pa?: boolean };
type PendingVehicle = { licensePlate: string; vehicleTypeCode: string };
const cards: Card[] = [
  { title: '1. Import bãi đậu', endpoint: '/api/v1/import/depots', columns: 'Tên bãi | X | Y | Địa chỉ', sample: 'Tên bãi,X,Y,Địa chỉ\nBến xe mẫu,10.7750,106.7000,TP.HCM\n', exportPath: '/api/v1/export/depots' },
  { title: '2. Import trạm sạc', endpoint: '/api/v1/import/stations', columns: 'Tên trạm | X | Y | Công suất', sample: 'Tên trạm,X,Y,Công suất\nTrạm sạc mẫu,10.7760,106.7010,10\n', exportPath: '/api/v1/export/stations' },
  { title: '3. Import PA đậu đêm cố định', endpoint: '/api/v1/import/routes', columns: 'Mã tuyến | Tên tuyến | Đầu bến | Bãi đậu đêm | Trạm sạc | Số xe PA | Thời gian huy động (phút) | Buffer (phút)', templatePath: '/api/v1/import/routes/template', exportPath: '/api/v1/export/overnight-plan', pa: true },
  { title: '4. Import bảng tài tiêu chuẩn', endpoint: '/api/v1/import/duty-roster', columns: 'Giữ nguyên form chuẩn: Tài/STT | GIỜ XB | BSX tại từng đầu bến.', templatePath: '/api/v1/import/duty-roster/template', roster: true },
];

function download(name: string, content: string) { const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }
async function downloadApi(path: string) { const response = await authFetch(path); if (!response.ok) throw new Error((await response.json()).error?.message ?? 'Không thể tải dữ liệu.'); const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = response.headers.get('content-disposition')?.match(/filename="?([^";]+)/)?.[1] ?? 'du-lieu.csv'; anchor.click(); URL.revokeObjectURL(url); }
async function responseBody(response: Response) { const raw = await response.text(); try { return JSON.parse(raw); } catch { return { error: { message: `Máy chủ trả về HTTP ${response.status}, nhưng không gửi dữ liệu lỗi hợp lệ.`, details: raw ? [`Nội dung phản hồi: ${raw.slice(0, 500)}`] : [] } }; } }

function UploadCard({ card, index }: { card: Card; index: number }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  const [file, setFile] = useState<File | null>(null); const [effectiveFrom, setEffectiveFrom] = useState(today); const [serviceDate, setServiceDate] = useState(today); const [result, setResult] = useState(''); const [details, setDetails] = useState<string[]>([]); const [failed, setFailed] = useState(false); const [loading, setLoading] = useState(false); const [pendingVehicles, setPendingVehicles] = useState<PendingVehicle[]>([]); const [vehicleTypes, setVehicleTypes] = useState<string[]>([]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!file) return;
    if (pendingVehicles.some((vehicle) => !vehicle.vehicleTypeCode)) { setFailed(true); setResult('Hãy chọn loại xe cho toàn bộ biển số mới trước khi xác nhận import.'); return; }
    setLoading(true); setResult(''); setDetails([]); setFailed(false);
    const body = new FormData(); body.set('file', file); if (card.pa) body.set('effectiveFrom', effectiveFrom); if (card.roster) body.set('serviceDate', serviceDate); if (pendingVehicles.length) body.set('newVehicles', JSON.stringify(pendingVehicles));
    try {
      const response = await authFetch(card.endpoint, { method: 'POST', body }); const data = await responseBody(response);
      if (data.needsVehicleConfirmation) {
        const plates: string[] = Array.isArray(data.missingVehicles) ? (data.missingVehicles as unknown[]).map((value: unknown) => String(value)) : [];
        setPendingVehicles(plates.map((licensePlate) => ({ licensePlate, vehicleTypeCode: '' }))); setVehicleTypes(Array.isArray(data.vehicleTypes) ? data.vehicleTypes.map(String) : []);
        setFailed(false); setResult(data.message ?? `Có ${plates.length} xe chưa có trong danh mục.`); setDetails(['Chọn loại xe cho từng biển số phía dưới, sau đó bấm “Xác nhận thêm xe và import”.']); return;
      }
      setPendingVehicles([]); setVehicleTypes([]); setFailed(!response.ok);
      setResult(response.ok ? data.message ?? 'Đã import thành công.' : data.error?.message ?? data.message ?? `Import thất bại (HTTP ${response.status}).`);
      setDetails(Array.isArray(data.error?.details) ? data.error.details.map(String) : []);
    } catch (caught) { setFailed(true); setResult(`Không thể kết nối máy chủ: ${caught instanceof Error ? caught.message : 'lỗi không xác định.'}`); } finally { setLoading(false); }
  };
  return <article className="import-card"><div><h2>{card.title}</h2><p>Cột hệ thống đọc: <b>{card.columns}</b></p>{card.pa && <p>PA là cấu hình cố định. Hệ thống chỉ liên kết tên bãi/trạm đã có, không tự tạo địa điểm mới để tránh trùng tọa độ.</p>}{card.roster && <p>Chọn <b>ngày vận doanh</b> trên bảng tài. Ca được mở từ 18:00 ngày trước đến 06:00 của ngày này; chỉ tuyến đang nhập được cập nhật, các tuyến khác được giữ nguyên.</p>}</div><div className="import-actions">{card.sample && <button type="button" onClick={() => download(`mau-import-${index}.csv`, card.sample!)}>Tải mẫu CSV</button>}{card.templatePath && <button type="button" onClick={() => window.open(card.templatePath, '_self')}>Tải mẫu</button>}{card.exportPath && <button type="button" onClick={() => downloadApi(card.exportPath!).catch((error: Error) => { setFailed(true); setResult(error.message); })}>Tải dữ liệu hiện tại</button>}</div><form onSubmit={submit}>{card.pa && <label>Hiệu lực từ <input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} required /></label>}{card.roster && <label>Ngày vận doanh <input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} required /></label>}<input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPendingVehicles([]); setVehicleTypes([]); }} /><button className="import-submit" disabled={!file || loading}>{loading ? 'Đang tải lên…' : pendingVehicles.length ? 'Xác nhận thêm xe và import' : 'Đối chiếu và import'}</button></form>{pendingVehicles.length > 0 && <section className="new-vehicle-confirm"><h3>Xác nhận xe mới ({pendingVehicles.length})</h3><p>Các biển số này chưa tồn tại trong danh mục xe. Chọn loại xe trước khi hệ thống tạo task.</p>{pendingVehicles.map((vehicle, vehicleIndex) => <label key={vehicle.licensePlate}><b>{vehicle.licensePlate}</b><select value={vehicle.vehicleTypeCode} onChange={(event) => setPendingVehicles((items) => items.map((item, itemIndex) => itemIndex === vehicleIndex ? { ...item, vehicleTypeCode: event.target.value } : item))}><option value="">Chọn loại xe</option>{vehicleTypes.map((type) => <option value={type} key={type}>{type}</option>)}</select></label>)}</section>}{result && <div className={failed ? 'import-result import-result-error' : 'import-result'}><p>{result}</p>{details.length > 0 && <ul>{details.slice(0, 50).map((item, detailIndex) => <li key={detailIndex}>{item}</li>)}</ul>}{details.length > 50 && <p>Còn {details.length - 50} lỗi khác; hãy sửa file rồi import lại.</p>}</div>}</article>;
}

export default function ImportDemoPage() { return <main className="import-page"><header><h1>Import dữ liệu</h1><p>PA đậu đêm là cấu hình dài hạn, có phiên bản và ngày hiệu lực. Bảng tài là dữ liệu vận hành từng ngày.</p></header>{cards.map((card, index) => <UploadCard key={card.endpoint} card={card} index={index} />)}</main>; }
