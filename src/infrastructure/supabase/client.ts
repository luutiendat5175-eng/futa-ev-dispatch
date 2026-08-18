import { createBrowserClient } from '@supabase/ssr';

/**
 * Dùng trong Client Component ("use client").
 * Đọc 2 biến NEXT_PUBLIC_* từ .env.local — 2 biến này an toàn để lộ ra trình duyệt
 * vì đã được Supabase RLS bảo vệ ở tầng database.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'SUPABASE_ENV_MISSING: thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY trong .env.local',
    );
  }

  return createBrowserClient(url, anonKey);
}

