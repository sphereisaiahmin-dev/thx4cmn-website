import { NextResponse } from 'next/server';

import { listR2Objects } from '@/lib/r2';
import { localFixtureTrack } from '@/lib/webplayer/fixture';
import { createTracksFromKeys } from '@/lib/webplayer/music-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

export async function GET() {
  try {
    const keys = await listR2Objects('music/');
    const tracks = createTracksFromKeys(keys);

    return NextResponse.json({ tracks }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json(
        { tracks: [localFixtureTrack], source: 'local-fixture' },
        { headers: NO_STORE_HEADERS },
      );
    }

    const message = error instanceof Error ? error.message : 'Unable to list tracks.';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
