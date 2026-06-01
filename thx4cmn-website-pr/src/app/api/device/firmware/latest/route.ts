import { NextResponse } from 'next/server';

import {
  computeReleaseRank,
  loadDeviceFirmwareManifest,
} from '@/lib/deviceFirmwareManifest';
import {
  buildLatestFirmwareResponse,
  buildUnavailableLatestFirmwareResponse,
} from '@/lib/deviceFirmwareLookup';
import { getSignedDownloadUrl } from '@/lib/r2';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const currentVersion = searchParams.get('currentVersion');
  const device = searchParams.get('device') ?? 'hx01';

  if (!currentVersion) {
    return NextResponse.json({ error: 'Missing currentVersion.' }, { status: 400 });
  }

  try {
    const currentReleaseRank = computeReleaseRank(currentVersion);
    if (currentReleaseRank === null) {
      return NextResponse.json({ error: 'Unsupported currentVersion format.' }, { status: 400 });
    }

    const manifest = await loadDeviceFirmwareManifest().catch(() => null);
    if (!manifest) {
      return NextResponse.json(
        buildUnavailableLatestFirmwareResponse(currentVersion, currentReleaseRank),
      );
    }

    const response = await buildLatestFirmwareResponse({
      currentVersion,
      device,
      manifest,
      signDownloadUrl: getSignedDownloadUrl,
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resolve latest firmware.';
    const status =
      message.startsWith('Unknown device "') ? 404 : message === 'Unsupported currentVersion format.' ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
