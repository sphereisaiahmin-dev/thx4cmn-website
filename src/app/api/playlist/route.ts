import { NextResponse } from 'next/server';

import { playlist } from '@/data/playlist';
import { getSignedDownloadUrl } from '@/lib/r2';

export const dynamic = 'force-dynamic';

export const GET = async () => {
  const tracks = await Promise.all(
    playlist.map(async (track) => ({
      ...track,
      url: await getSignedDownloadUrl(track.key, 300),
    })),
  );

  return NextResponse.json(
    { tracks },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
};
