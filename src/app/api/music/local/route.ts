import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const LOCAL_AUDIO_DIR = path.join(process.cwd(), 'audiowebplayer');
const SUPPORTED_EXTENSIONS = ['.mp3', '.m4a', '.wav'];

const getContentType = (filename: string) => {
  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case '.m4a':
      return 'audio/mp4';
    case '.wav':
      return 'audio/wav';
    case '.mp3':
    default:
      return 'audio/mpeg';
  }
};

const isSupportedAudio = (filename: string) =>
  SUPPORTED_EXTENSIONS.some((extension) => filename.toLowerCase().endsWith(extension));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Missing key.' }, { status: 400 });
  }

  const filename = path.basename(key);
  if (!isSupportedAudio(filename)) {
    return NextResponse.json({ error: 'Invalid key.' }, { status: 400 });
  }

  const filePath = path.join(LOCAL_AUDIO_DIR, filename);
  try {
    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        'Content-Type': getContentType(filename),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read audio.';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
