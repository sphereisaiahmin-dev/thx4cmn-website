import { NextResponse } from 'next/server';

import { isPublicMusicTrackKey } from '@/lib/musicTracks';
import { getSignedDownloadUrl } from '@/lib/r2';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { LOCAL_FIXTURE_PREFIX, toFixtureSignedUrl } from '@/lib/webplayer/fixture';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const clientIp = getClientIp(request);
  const limit = checkRateLimit({
    key: `music-signed-url:${clientIp}`,
    limit: 180,
    windowMs: 10 * 60 * 1000,
  });
  if (limit.limited) {
    return NextResponse.json(
      { error: 'Too many music signing attempts.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Missing key.' }, { status: 400 });
  }

  const isLocalFixtureKey = key.startsWith(LOCAL_FIXTURE_PREFIX) && key.toLowerCase().endsWith('.mp3');

  if (process.env.NODE_ENV !== 'production' && isLocalFixtureKey) {
    return NextResponse.json({ url: toFixtureSignedUrl(key) });
  }

  try {
    const isAllowedR2Key = await isPublicMusicTrackKey(key);
    if (!isAllowedR2Key) {
      return NextResponse.json({ error: 'Invalid key.' }, { status: 400 });
    }

    const url = await getSignedDownloadUrl(key, 90);
    return NextResponse.json({ url });
  } catch (error) {
    console.error('[MusicSignedUrl] Failed to sign track URL.', { key, error });
    const message = error instanceof Error ? error.message : 'Unable to sign URL.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
