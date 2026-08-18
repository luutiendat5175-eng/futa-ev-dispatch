'use client';

import { createClient } from '@/infrastructure/supabase/client';

/** Fetch same-origin APIs with the current Supabase access token.
 * This also works on localhost when a server cookie has not yet been written. */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data } = await createClient().auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}
