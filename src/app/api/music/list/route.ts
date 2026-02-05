import { NextResponse } from 'next/server';

import { listR2Objects } from '@/lib/r2';
import { localFixtureTrack } from '@/lib/webplayer/fixture';

export const runtime = 'nodejs';

const MUSIC_PREFIX = 'music/';

const deriveTitle = (key: string) => {
  const trimmed = key.replace(MUSIC_PREFIX, '').replace(/\.mp3$/i, '');
  return decodeURIComponent(trimmed.replace(/\+/g, ' '));
};

export async function GET() {
  try {
    const keys = await listR2Objects(MUSIC_PREFIX);
    const tracks = keys
      .filter((key) => key.startsWith(MUSIC_PREFIX) && key.toLowerCase().endsWith('.mp3'))
      .map((key) => ({
        key,
        title: deriveTitle(key),
      }));

    return NextResponse.json({ tracks });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json({ tracks: [localFixtureTrack], source: 'local-fixture' });
    }

    const message = error instanceof Error ? error.message : 'Unable to list tracks.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
