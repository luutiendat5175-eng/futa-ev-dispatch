import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Dùng trong Server Component, Route Handler (app/api/**), Server Action.
 * Đọc cookie phiên đăng nhập để Supabase biết user hiện tại là ai (phục vụ RLS).
 */
export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'SUPABASE_ENV_MISSING: thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY trong .env.local',
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // setAll được gọi từ Server Component - bỏ qua vì middleware sẽ refresh session
        }
      },
    },
  });
}

/**
 * Client dùng service_role key - CHỈ dùng trong Route Handler phía server
 * (vd import Excel, Edge Function nội bộ). KHÔNG BAO GIỜ import file này
 * vào Client Component, vì service_role key có toàn quyền, bỏ qua RLS.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_ENV_MISSING: thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local',
    );
  }

  const { createClient: createRawClient } = require('@supabase/supabase-js');
  return createRawClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Creates a server-side client that keeps the signed-in browser user's JWT.
 * Route handlers called by fetch do not automatically receive the SSR cookie,
 * so this is required for SQL functions that depend on auth.uid().
 */
export function createUserAccessTokenClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('SUPABASE_ENV_MISSING');
  const { createClient: createRawClient } = require('@supabase/supabase-js');
  return createRawClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
