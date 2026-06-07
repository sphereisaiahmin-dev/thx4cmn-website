import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  createHx01AccessToken,
  HX01_ACCESS_COOKIE_MAX_AGE_SECONDS,
  HX01_ACCESS_COOKIE_NAME,
  verifyHx01Pin,
} from '@/lib/hx01Access';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  const limit = checkRateLimit({
    key: `hx01-access:${clientIp}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (limit.limited) {
    return NextResponse.json(
      { error: 'Too many access attempts.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

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
  let accessToken: string;
  try {
    accessToken = createHx01AccessToken();
  } catch (error) {
    console.error('HX01 access is not configured.', error);
    return NextResponse.json({ error: 'HX01 access is not configured.' }, { status: 503 });
  }

  cookieStore.set(HX01_ACCESS_COOKIE_NAME, accessToken, {
    httpOnly: true,
    maxAge: HX01_ACCESS_COOKIE_MAX_AGE_SECONDS,
    path: '/device',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return NextResponse.json({ ok: true });
}
