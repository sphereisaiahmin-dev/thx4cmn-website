import { getR2ObjectText } from './r2';
import {
  DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV,
  DEVICE_FIRMWARE_LOCAL_PACKAGE_ROUTE,
  computeReleaseRank,
  loadLocalFirmwarePackageMetadata,
  parseSemver,
} from './deviceFirmwareLocalPackage';

export {
  DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV,
  DEVICE_FIRMWARE_LOCAL_PACKAGE_ROUTE,
  computeReleaseRank,
  parseSemver,
};

export type FirmwareUpdateStrategy = 'direct_flash';

export interface FirmwareReleaseManifestEntry {
  version: string;
  releaseRank: number;
  packageKey?: string;
  downloadUrl?: string;
  sha256: string;
  strategy: FirmwareUpdateStrategy;
  notes?: string;
}

export interface DeviceFirmwareManifest {
  device: string;
  generatedAt: string;
  latestVersion: string;
  latestReleaseRank: number;
  releases: FirmwareReleaseManifestEntry[];
}

export const FIRMWARE_MANIFEST_KEY = 'updates/firmware-manifest.json';

const isObject = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);

const isManifestRelease = (candidate: unknown): candidate is FirmwareReleaseManifestEntry => {
  if (!isObject(candidate)) {
    return false;
  }

  const hasPackageKey = typeof candidate.packageKey === 'string' && candidate.packageKey.length > 0;
  const hasDownloadUrl = typeof candidate.downloadUrl === 'string' && candidate.downloadUrl.length > 0;

  return (
    typeof candidate.version === 'string' &&
    typeof candidate.releaseRank === 'number' &&
    Number.isFinite(candidate.releaseRank) &&
    (hasPackageKey || hasDownloadUrl) &&
    typeof candidate.sha256 === 'string' &&
    candidate.strategy === 'direct_flash' &&
    (candidate.notes === undefined || typeof candidate.notes === 'string')
  );
};

export const normalizeFirmwareManifest = (candidate: unknown): DeviceFirmwareManifest => {
  if (!isObject(candidate) || !Array.isArray(candidate.releases)) {
    throw new Error('Firmware manifest is malformed.');
  }

  const releases = candidate.releases.filter(isManifestRelease).sort((a, b) => b.releaseRank - a.releaseRank);
  if (releases.length === 0) {
    throw new Error('Firmware manifest has no valid release entries.');
  }

  const latestRelease = releases[0];
  return {
    device: typeof candidate.device === 'string' ? candidate.device : 'hx01',
    generatedAt:
      typeof candidate.generatedAt === 'string' ? candidate.generatedAt : new Date().toISOString(),
    latestVersion:
      typeof candidate.latestVersion === 'string' ? candidate.latestVersion : latestRelease.version,
    latestReleaseRank:
      typeof candidate.latestReleaseRank === 'number' && Number.isFinite(candidate.latestReleaseRank)
        ? candidate.latestReleaseRank
        : latestRelease.releaseRank,
    releases,
  };
};

export const loadLocalDeviceFirmwareManifest = () => {
  const metadata = loadLocalFirmwarePackageMetadata();
  if (!metadata) {
    return null;
  }

  return normalizeFirmwareManifest({
    device: 'hx01',
    generatedAt: new Date().toISOString(),
    latestVersion: metadata.version,
    latestReleaseRank: metadata.releaseRank,
    releases: [
      {
        version: metadata.version,
        releaseRank: metadata.releaseRank,
        downloadUrl: metadata.downloadUrl,
        sha256: metadata.sha256,
        strategy: 'direct_flash',
        notes: metadata.notes,
      },
    ],
  });
};

export const loadDeviceFirmwareManifest = async () => {
  const localManifest = loadLocalDeviceFirmwareManifest();
  if (localManifest) {
    return localManifest;
  }

  const manifestText = await getR2ObjectText(FIRMWARE_MANIFEST_KEY);
  const parsed = JSON.parse(manifestText) as unknown;
  return normalizeFirmwareManifest(parsed);
};

export const resolveReleaseByVersion = (
  manifest: DeviceFirmwareManifest,
  version: string,
): FirmwareReleaseManifestEntry | null =>
  manifest.releases.find((release) => release.version === version) ?? null;

export const resolveReleaseRank = (manifest: DeviceFirmwareManifest, version: string) => {
  const release = resolveReleaseByVersion(manifest, version);
  if (release) {
    return release.releaseRank;
  }

  return computeReleaseRank(version);
};

export const findLatestRelease = (manifest: DeviceFirmwareManifest) =>
  manifest.releases.reduce((current, release) =>
    release.releaseRank > current.releaseRank ? release : current,
  manifest.releases[0]);
