export type LatestFirmwareResponse = {
  updateAvailable: boolean;
  strategy: 'none' | 'direct_flash';
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

export type FirmwareReleaseLike = {
  version: string;
  releaseRank: number;
  packageKey?: string;
  downloadUrl?: string;
  sha256: string;
  strategy: 'direct_flash';
  notes?: string;
};

export type FirmwareManifestLike = {
  device?: string;
  generatedAt?: string;
  latestVersion?: string;
  latestReleaseRank?: number;
  releases: FirmwareReleaseLike[];
};

const CANONICAL_DEVICE_ID = 'hx01';
const UPDATES_UNAVAILABLE_NOTE = 'Firmware updates are unavailable right now.';

const normalizeDeviceId = (candidate: string) => candidate.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const parseSemver = (candidate: string) => {
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

const computeReleaseRank = (version: string) => {
  const parsed = parseSemver(version);
  if (!parsed) {
    return null;
  }

  if (parsed.major === 0) {
    return 50000 + parsed.minor * 100 + parsed.patch;
  }

  return parsed.major * 10000 + parsed.minor * 100 + parsed.patch;
};

const findLatestRelease = (manifest: FirmwareManifestLike) =>
  manifest.releases.reduce((current, release) =>
    release.releaseRank > current.releaseRank ? release : current,
  manifest.releases[0]);

const buildNoUpdateResponse = (
  currentVersion: string,
  currentReleaseRank: number,
  latestVersion: string,
  latestReleaseRank: number,
  notes?: string,
): LatestFirmwareResponse => ({
  updateAvailable: false,
  strategy: 'none',
  currentVersion,
  currentReleaseRank,
  latestVersion,
  latestReleaseRank,
  notes,
});

export const isSupportedFirmwareDevice = (candidate: string) =>
  normalizeDeviceId(candidate) === CANONICAL_DEVICE_ID;

export const buildUnavailableLatestFirmwareResponse = (
  currentVersion: string,
  currentReleaseRank: number,
  latestVersion = currentVersion,
  latestReleaseRank = currentReleaseRank,
): LatestFirmwareResponse =>
  buildNoUpdateResponse(
    currentVersion,
    currentReleaseRank,
    latestVersion,
    latestReleaseRank,
    UPDATES_UNAVAILABLE_NOTE,
  );

export const buildLatestFirmwareResponse = async ({
  currentVersion,
  device,
  manifest,
  signDownloadUrl,
}: {
  currentVersion: string;
  device: string;
  manifest: FirmwareManifestLike;
  signDownloadUrl?: (key: string, expiresInSeconds?: number) => Promise<string>;
}): Promise<LatestFirmwareResponse> => {
  if (!isSupportedFirmwareDevice(device)) {
    throw new Error(`Unknown device "${device}".`);
  }

  const currentSemver = parseSemver(currentVersion);
  if (!currentSemver) {
    throw new Error('Unsupported currentVersion format.');
  }

  const currentReleaseRank = computeReleaseRank(currentVersion);
  if (currentReleaseRank === null) {
    throw new Error('Unsupported currentVersion format.');
  }

  if (!Array.isArray(manifest.releases) || manifest.releases.length === 0) {
    return buildUnavailableLatestFirmwareResponse(currentVersion, currentReleaseRank);
  }

  const latestRelease = findLatestRelease(manifest);
  if (currentSemver.major !== 0) {
    return buildNoUpdateResponse(
      currentVersion,
      currentReleaseRank,
      latestRelease.version,
      latestRelease.releaseRank,
      `Firmware ${currentVersion} is on an unsupported update line.`,
    );
  }

  if (currentVersion === latestRelease.version || currentReleaseRank >= latestRelease.releaseRank) {
    return buildNoUpdateResponse(
      currentVersion,
      currentReleaseRank,
      latestRelease.version,
      latestRelease.releaseRank,
    );
  }

  let downloadUrl = latestRelease.downloadUrl;
  if (!downloadUrl && latestRelease.packageKey && signDownloadUrl) {
    try {
      downloadUrl = await signDownloadUrl(latestRelease.packageKey, 600);
    } catch {
      return buildUnavailableLatestFirmwareResponse(
        currentVersion,
        currentReleaseRank,
        latestRelease.version,
        latestRelease.releaseRank,
      );
    }
  }

  return {
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
};
