'use client';

import { useEffect, useState } from 'react';

type GpsState = 'checking' | 'granted' | 'prompt' | 'denied' | 'unsupported';

/** Requests location after a signed-in screen opens. Browser permission remains under
 * the employee's control; every proof submission still asks the device for a fresh fix. */
export function GpsPermissionGate() {
  const [state, setState] = useState<GpsState>('checking');
  const [message, setMessage] = useState('Đang kiểm tra quyền GPS…');

  const requestGps = () => {
    if (!navigator.geolocation) {
      setState('unsupported'); setMessage('Thiết bị này không hỗ trợ GPS.'); return;
    }
    setState('checking'); setMessage('Đang yêu cầu vị trí chính xác…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        sessionStorage.setItem('ev-dispatch-last-gps', JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, recordedAt: Date.now() }));
        setState('granted'); setMessage('GPS đã sẵn sàng cho chấm công và giao nhận xe.');
      },
      () => { setState('denied'); setMessage('Cần cấp quyền Vị trí chính xác để chấm công và chuyển trạng thái xe.'); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  useEffect(() => {
    let permission: PermissionStatus | undefined;
    const check = async () => {
      try {
        permission = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        if (permission) {
          permission.onchange = () => { if (permission?.state !== 'granted') requestGps(); };
          if (permission.state === 'denied') { setState('denied'); setMessage('Quyền GPS đang bị chặn trong trình duyệt.'); return; }
        }
      } catch { /* Permissions API is optional on mobile browsers. */ }
      requestGps();
    };
    void check();
    return () => { if (permission) permission.onchange = null; };
  }, []);

  if (state === 'granted' || state === 'checking') return null;
  return <section className="gps-permission-bar" role="status"><span>{message}</span><button type="button" onClick={requestGps}>Bật GPS</button></section>;
}
