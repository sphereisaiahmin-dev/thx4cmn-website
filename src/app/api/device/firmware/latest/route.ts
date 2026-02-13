import { NextResponse } from 'next/server';

import {
  findBridgeReleaseForVersion,
  findLatestRelease,
  loadDeviceFirmwareManifest,
  resolveReleaseRank,
} from '@/lib/deviceFirmwareManifest';
import { getSignedDownloadUrl } from '@/lib/r2';

export const runtime = 'nodejs';

type LatestFirmwareResponse = {
  updateAvailable: boolean;
  strategy: 'none' | 'manual_bridge' | 'direct_flash';
  currentVersion: string;
  currentReleaseRank: number;
  latestVersion: string;
  latestReleaseRank: number;
  targetVersion?: string;
  targetReleaseRank?: number;
  packageKey?: string;
  downloadUrl?: string;
  sha256?: string;
  notes?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const currentVersion = searchParams.get('currentVersion');
  const device = searchParams.get('device') ?? 'thx-c';

  if (!currentVersion) {
    return NextResponse.json({ error: 'Missing currentVersion.' }, { status: 400 });
  }

  try {
    const manifest = await loadDeviceFirmwareManifest();
    if (manifest.device !== device) {
      return NextResponse.json({ error: `Unknown device "${device}".` }, { status: 404 });
    }

    const latestRelease = findLatestRelease(manifest);
    const currentReleaseRank = resolveReleaseRank(manifest, currentVersion);
    if (currentReleaseRank === null) {
      return NextResponse.json({ error: 'Unsupported currentVersion format.' }, { status: 400 });
    }

    const bridgeRelease = findBridgeReleaseForVersion(manifest, currentVersion);
    if (bridgeRelease && bridgeRelease.version !== currentVersion) {
      const bridgeUrl = await getSignedDownloadUrl(bridgeRelease.packageKey, 120);
      const response: LatestFirmwareResponse = {
        updateAvailable: true,
        strategy: 'manual_bridge',
        currentVersion,
        currentReleaseRank,
        latestVersion: latestRelease.version,
        latestReleaseRank: latestRelease.releaseRank,
        targetVersion: bridgeRelease.version,
        targetReleaseRank: bridgeRelease.releaseRank,
        packageKey: bridgeRelease.packageKey,
        downloadUrl: bridgeUrl,
        sha256: bridgeRelease.sha256,
        notes: bridgeRelease.notes,
      };

      return NextResponse.json(response);
    }

    if (currentVersion === latestRelease.version || currentReleaseRank >= latestRelease.releaseRank) {
      const response: LatestFirmwareResponse = {
        updateAvailable: false,
        strategy: 'none',
        currentVersion,
        currentReleaseRank,
        latestVersion: latestRelease.version,
        latestReleaseRank: latestRelease.releaseRank,
      };
      return NextResponse.json(response);
    }

    const downloadUrl = await getSignedDownloadUrl(latestRelease.packageKey, 120);
    const response: LatestFirmwareResponse = {
      updateAvailable: true,
      strategy: latestRelease.strategy,
      currentVersion,
      currentReleaseRank,
      latestVersion: latestRelease.version,
      latestReleaseRank: latestRelease.releaseRank,
      targetVersion: latestRelease.version,
      targetReleaseRank: latestRelease.releaseRank,
      packageKey: latestRelease.packageKey,
      downloadUrl,
      sha256: latestRelease.sha256,
      notes: latestRelease.notes,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resolve latest firmware.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
