import { NextResponse } from 'next/server';

import { getSignedDownloadUrl } from '@/lib/r2';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Missing key parameter.' }, { status: 400 });
  }

  if (!key.startsWith('music/')) {
    return NextResponse.json({ error: 'Invalid music key.' }, { status: 400 });
  }

  try {
    const url = await getSignedDownloadUrl(key, 120);
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Failed to sign music URL', error);
    return NextResponse.json({ error: 'Failed to sign music URL.' }, { status: 500 });
  }
}
