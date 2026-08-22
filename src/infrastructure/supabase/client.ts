import { createBrowserClient } from '@supabase/ssr';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/** A single browser client avoids duplicated auth locks, refresh timers and realtime sockets. */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('SUPABASE_ENV_MISSING: thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY trong .env.local');
  if (!browserClient) browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
