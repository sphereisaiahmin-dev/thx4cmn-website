import fs from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { LOCAL_FIXTURE_TRACK_KEY } from '@/lib/webplayer/fixture';

export const runtime = 'nodejs';

const localFixturePath = path.join(process.cwd(), 'audiowebplayer', 'Dreams Come True.mp3');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (key !== LOCAL_FIXTURE_TRACK_KEY) {
    return NextResponse.json({ error: 'Invalid fixture key.' }, { status: 400 });
  }

  try {
    const file = await fs.readFile(localFixturePath);
    return new NextResponse(file, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load local fixture.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
