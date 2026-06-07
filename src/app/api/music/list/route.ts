import { NextResponse } from 'next/server';

import { getPublicMusicTracks } from '@/lib/musicTracks';
import { localFixtureTrack } from '@/lib/webplayer/fixture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ tracks: await getPublicMusicTracks() });
  } catch (error) {
    console.error('[MusicList] Failed to load tracks from R2.', error);

    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json({ tracks: [localFixtureTrack], source: 'local-fixture' });
    }

    const message = error instanceof Error ? error.message : 'Unable to list tracks.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
