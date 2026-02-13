import { NextResponse } from 'next/server';

import { getR2ObjectText } from '@/lib/r2';

export const runtime = 'nodejs';

const isValidPackageKey = (candidate: string) =>
  candidate.startsWith('updates/') &&
  candidate.endsWith('.json') &&
  !candidate.includes('..') &&
  !candidate.includes('\\');

const isValidSignedPackageUrl = (candidate: string) => {
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:') {
      return false;
    }

    if (!parsed.hostname.endsWith('.r2.cloudflarestorage.com')) {
      return false;
    }

    if (!parsed.pathname.startsWith('/updates/') || !parsed.pathname.endsWith('.json')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  const url = searchParams.get('url');

  if (!key && !url) {
    return NextResponse.json({ error: 'Missing key or url.' }, { status: 400 });
  }

  if (key && !isValidPackageKey(key)) {
    return NextResponse.json({ error: 'Invalid firmware package key.' }, { status: 400 });
  }

  if (url && !isValidSignedPackageUrl(url)) {
    return NextResponse.json({ error: 'Invalid firmware package url.' }, { status: 400 });
  }

  try {
    const text = key
      ? await getR2ObjectText(key)
      : await fetch(url as string, { cache: 'no-store' }).then(async (response) => {
          if (!response.ok) {
            throw new Error(`Signed package fetch failed (${response.status}).`);
          }
          return response.text();
        });
    const payload = JSON.parse(text) as unknown;
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read firmware package.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
