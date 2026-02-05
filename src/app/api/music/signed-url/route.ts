import { NextResponse } from 'next/server';

import { getSignedDownloadUrl } from '@/lib/r2';
import { LOCAL_FIXTURE_PREFIX, toFixtureSignedUrl } from '@/lib/webplayer/fixture';

export const runtime = 'nodejs';

const MUSIC_PREFIX = 'music/';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Missing key.' }, { status: 400 });
  }

  const isR2MusicKey = key.startsWith(MUSIC_PREFIX) && key.toLowerCase().endsWith('.mp3');
  const isLocalFixtureKey = key.startsWith(LOCAL_FIXTURE_PREFIX) && key.toLowerCase().endsWith('.mp3');

  if (!isR2MusicKey && !(process.env.NODE_ENV !== 'production' && isLocalFixtureKey)) {
    return NextResponse.json({ error: 'Invalid key.' }, { status: 400 });
  }

  if (process.env.NODE_ENV !== 'production' && isLocalFixtureKey) {
    return NextResponse.json({ url: toFixtureSignedUrl(key) });
  }

  try {
    const url = await getSignedDownloadUrl(key, 90);
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign URL.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
