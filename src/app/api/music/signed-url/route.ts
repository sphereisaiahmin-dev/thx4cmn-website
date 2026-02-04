import { NextResponse } from 'next/server';

import { getSignedDownloadUrl } from '@/lib/r2';

export const runtime = 'nodejs';

const MUSIC_PREFIX = 'music/';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Missing key.' }, { status: 400 });
  }

  if (!key.startsWith(MUSIC_PREFIX) || !key.toLowerCase().endsWith('.mp3')) {
    return NextResponse.json({ error: 'Invalid key.' }, { status: 400 });
  }

  try {
    const url = await getSignedDownloadUrl(key, 90);
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign URL.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
