import { NextResponse } from 'next/server';

import { getSignedDownloadUrl } from '@/lib/r2';

export const runtime = 'nodejs';

const MUSIC_PREFIX = 'music/';
const LOCAL_PREFIX = 'local/';
const SUPPORTED_EXTENSIONS = ['.mp3', '.m4a', '.wav'];

const isSupportedAudio = (key: string) =>
  SUPPORTED_EXTENSIONS.some((extension) => key.toLowerCase().endsWith(extension));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Missing key.' }, { status: 400 });
  }

  if (key.startsWith(LOCAL_PREFIX)) {
    if (!isSupportedAudio(key)) {
      return NextResponse.json({ error: 'Invalid key.' }, { status: 400 });
    }
    const filename = key.slice(LOCAL_PREFIX.length);
    return NextResponse.json({ url: `/api/music/local?key=${encodeURIComponent(filename)}` });
  }

  if (!key.startsWith(MUSIC_PREFIX) || !isSupportedAudio(key)) {
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
