'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/infrastructure/supabase/client';

const INTERNAL_EMAIL_DOMAIN = 'noibo.local';

export default function LoginPage() {
  const router = useRouter();
  const [employeeCode, setEmployeeCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const email = `${employeeCode.trim().toUpperCase()}@${INTERNAL_EMAIL_DOMAIN}`;
    const { error: signInError } = await createClient().auth.signInWithPassword({ email, password: pin });
    setLoading(false);
    if (signInError) {
      setError('MSNV hoặc PIN không đúng.');
      return;
    }
    // Tất cả lái xe phải ghi nhận vào ca (ảnh + GPS) trước khi nhận task.
    router.replace('/attendance');
    router.refresh();
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: 'linear-gradient(135deg,#e6fffb,#eff6ff)' }}>
      <form onSubmit={submit} style={{ width: 'min(100%, 380px)', display: 'grid', gap: 16, padding: 28, borderRadius: 18, background: '#fff', boxShadow: '0 18px 45px rgba(15,23,42,.12)' }}>
        <div>
          <p style={{ margin: 0, color: '#0d9488', fontWeight: 800, fontSize: 13 }}>EV DISPATCH</p>
          <h1 style={{ margin: '6px 0', fontSize: 26 }}>Bắt đầu ca làm việc</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Đăng nhập bằng mã số nhân viên và PIN.</p>
        </div>
        <label style={{ display: 'grid', gap: 6, fontSize: 14, fontWeight: 650 }}>
          Mã số nhân viên
          <input value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} autoComplete="username" required style={{ padding: 11, border: '1px solid #cbd5e1', borderRadius: 9 }} />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 14, fontWeight: 650 }}>
          PIN
          <input value={pin} onChange={(event) => setPin(event.target.value)} type="password" inputMode="numeric" autoComplete="current-password" minLength={4} required style={{ padding: 11, border: '1px solid #cbd5e1', borderRadius: 9 }} />
        </label>
        {error && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={loading} className="task-button task-button-primary" style={{ padding: 12 }}>
          {loading ? 'Đang đăng nhập…' : 'Vào ca làm việc'}
        </button>
      </form>
    </main>
  );
}
