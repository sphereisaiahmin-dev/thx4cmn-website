import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  createHx01AccessToken,
  HX01_ACCESS_COOKIE_MAX_AGE_SECONDS,
  HX01_ACCESS_COOKIE_NAME,
  verifyHx01Pin,
} from '@/lib/hx01Access';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid PIN.' }, { status: 401 });
  }

  const pin =
    typeof payload === 'object' && payload !== null && 'pin' in payload
      ? (payload as { pin?: unknown }).pin
      : undefined;

  if (!verifyHx01Pin(pin)) {
    return NextResponse.json({ error: 'Invalid PIN.' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(HX01_ACCESS_COOKIE_NAME, createHx01AccessToken(), {
    httpOnly: true,
    maxAge: HX01_ACCESS_COOKIE_MAX_AGE_SECONDS,
    path: '/device',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return NextResponse.json({ ok: true });
}
