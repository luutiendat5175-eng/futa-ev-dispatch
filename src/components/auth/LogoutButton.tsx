'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/infrastructure/supabase/client';

export function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return <button onClick={handleLogout} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Đăng xuất</button>;
}
