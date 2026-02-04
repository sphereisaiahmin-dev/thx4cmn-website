import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { listR2Objects } from '@/lib/r2';

export const runtime = 'nodejs';

const MUSIC_PREFIX = 'music/';
const LOCAL_PREFIX = 'local/';
const LOCAL_AUDIO_DIR = path.join(process.cwd(), 'audiowebplayer');
const SUPPORTED_EXTENSIONS = ['.mp3', '.m4a', '.wav'];

const deriveTitle = (key: string, prefix: string) => {
  const trimmed = key.replace(prefix, '').replace(/\.[^/.]+$/i, '');
  return decodeURIComponent(trimmed.replace(/\+/g, ' '));
};

const hasR2Config = () =>
  Boolean(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);

const isSupportedAudio = (key: string) =>
  SUPPORTED_EXTENSIONS.some((extension) => key.toLowerCase().endsWith(extension));

export async function GET() {
  try {
    let tracks: { key: string; title: string }[] = [];

    if (hasR2Config()) {
      try {
        tracks = (await listR2Objects(MUSIC_PREFIX))
          .filter((key) => key.startsWith(MUSIC_PREFIX) && isSupportedAudio(key))
          .map((key) => ({
            key,
            title: deriveTitle(key, MUSIC_PREFIX),
          }));
      } catch (error) {
        tracks = [];
      }
    }

    if (!tracks.length) {
      tracks = (await readdir(LOCAL_AUDIO_DIR))
        .filter((filename) => isSupportedAudio(filename))
        .map((filename) => ({
          key: `${LOCAL_PREFIX}${filename}`,
          title: deriveTitle(filename, ''),
        }));
    }

    return NextResponse.json({ tracks });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list tracks.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
