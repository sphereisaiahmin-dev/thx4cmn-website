import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { HX01_ACCESS_COOKIE_NAME } from '@/lib/hx01Access';

export const runtime = 'nodejs';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set(HX01_ACCESS_COOKIE_NAME, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/device',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return NextResponse.json({ ok: true });
}
