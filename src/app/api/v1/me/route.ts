import { NextResponse } from 'next/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

/** GET /api/v1/me - thông tin user đang đăng nhập (id, role, tên) */
export async function GET() {
  try {
    const actor = await getCurrentUserContext();
    return NextResponse.json(actor);
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: err.message } },
        { status: 401 },
      );
    }
    throw err;
  }
}

