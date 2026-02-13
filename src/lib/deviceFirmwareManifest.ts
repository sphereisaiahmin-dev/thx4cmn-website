import { getR2ObjectText } from '@/lib/r2';

export type FirmwareUpdateStrategy = 'direct_flash';

export interface FirmwareReleaseManifestEntry {
  version: string;
  releaseRank: number;
  packageKey: string;
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

type SemverTuple = {
  major: number;
  minor: number;
  patch: number;
};

export const parseSemver = (candidate: string): SemverTuple | null => {
  const normalized = candidate.trim().replace(/^v/i, '');
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
};

export const computeReleaseRank = (version: string): number | null => {
  const parsed = parseSemver(version);
  if (!parsed) {
    return null;
  }

  // Preserve update ordering so 0.x firmware can supersede legacy 2.x line.
  if (parsed.major === 0) {
    return 50000 + parsed.minor * 100 + parsed.patch;
  }

  return parsed.major * 10000 + parsed.minor * 100 + parsed.patch;
};

const isObject = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);

const isManifestRelease = (candidate: unknown): candidate is FirmwareReleaseManifestEntry => {
  if (!isObject(candidate)) {
    return false;
  }

  return (
    typeof candidate.version === 'string' &&
    typeof candidate.releaseRank === 'number' &&
    Number.isFinite(candidate.releaseRank) &&
    typeof candidate.packageKey === 'string' &&
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
    device: typeof candidate.device === 'string' ? candidate.device : 'thx-c',
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

export const loadDeviceFirmwareManifest = async () => {
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
