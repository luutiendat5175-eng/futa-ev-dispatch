'use client';

import { createClient } from '@/infrastructure/supabase/client';

/** Fetch same-origin APIs with the current Supabase access token.
 * This also works on localhost when a server cookie has not yet been written. */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const client = createClient();
  const buildHeaders = async () => {
    const { data } = await client.auth.getSession();
    const headers = new Headers(init.headers);
    if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
    return headers;
  };
  let response = await fetch(input, { ...init, headers: await buildHeaders() });
  // A tab may hold an expired JWT while its refresh token is still valid. Retry
  // once with a refreshed session instead of showing a misleading realtime error.
  if (response.status === 401) {
    const { data } = await client.auth.refreshSession();
    if (data.session?.access_token) {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${data.session.access_token}`);
      response = await fetch(input, { ...init, headers });
    }
  }
  return response;
}
