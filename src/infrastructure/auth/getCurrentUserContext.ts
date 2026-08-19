import { headers } from 'next/headers';
import { createClient, createServiceRoleClient } from '@/infrastructure/supabase/server';
import type { UserRole } from '@/domain/task/taskStateMachine';

export interface CurrentUserContext { userId: string; role: UserRole; fullName: string; }

export class UnauthenticatedError extends Error {
  constructor() {
    super('UNAUTHENTICATED: chưa đăng nhập, phiên đã hết hạn hoặc chưa có hồ sơ nhân viên');
    this.name = 'UnauthenticatedError';
  }
}

/** Resolves the user from either the SSR cookie or a Bearer token sent by the app. */
export async function getCurrentUserContext(): Promise<CurrentUserContext> {
  const requestHeaders = await headers();
  const authorization = requestHeaders.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  const authClient = token ? createServiceRoleClient() : await createClient();
  const { data: { user: authUser }, error: authError } = token
    ? await authClient.auth.getUser(token)
    : await authClient.auth.getUser();
  if (authError || !authUser) throw new UnauthenticatedError();

  const profileClient = token ? createServiceRoleClient() : authClient;
  const { data: profile, error } = await profileClient
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', authUser.id)
    .maybeSingle();
  if (error || !profile || !profile.is_active) throw new UnauthenticatedError();
  return { userId: profile.id as string, role: profile.role as UserRole, fullName: profile.full_name as string };
}
