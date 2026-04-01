import { createHash } from 'node:crypto';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { readFileSync, statSync } from 'node:fs';

export const DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV = 'DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH';
export const DEVICE_FIRMWARE_LOCAL_PACKAGE_ROUTE = '/api/device/firmware/package?local=1';

const LOCAL_DIRECT_PACKAGE_PATTERN = /^hx01-firmware-.+-direct\.json$/i;

type SemverTuple = {
  major: number;
  minor: number;
  patch: number;
};

type LocalFirmwarePackage = {
  version: string;
  files: Array<Record<string, unknown>>;
};

export type LocalFirmwarePackageSource = {
  packagePath: string;
  packageText: string;
};

export type LocalFirmwarePackageMetadata = LocalFirmwarePackageSource & {
  version: string;
  releaseRank: number;
  sha256: string;
  downloadUrl: string;
  notes: string;
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

  if (parsed.major === 0) {
    return 50000 + parsed.minor * 100 + parsed.patch;
  }

  return parsed.major * 10000 + parsed.minor * 100 + parsed.patch;
};

const isObject = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);

const isPathWithinDirectory = (rootPath: string, candidatePath: string) => {
  const relativePath = relative(rootPath, candidatePath);
  return !relativePath.startsWith('..') && !isAbsolute(relativePath);
};

const isLocalFirmwarePackage = (candidate: unknown): candidate is LocalFirmwarePackage =>
  isObject(candidate) &&
  typeof candidate.version === 'string' &&
  Array.isArray(candidate.files) &&
  candidate.files.length > 0 &&
  candidate.files.every((file) => isObject(file));

export const resolveLocalFirmwarePackagePath = (
  configuredPath = process.env[DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV] ?? '',
  workspaceRoot = resolve(process.cwd()),
) => {
  const trimmed = configuredPath.trim();
  if (!trimmed) {
    return null;
  }

  const distRoot = resolve(workspaceRoot, 'dist');
  const resolvedPackagePath = isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolve(workspaceRoot, trimmed);
  if (!isPathWithinDirectory(distRoot, resolvedPackagePath)) {
    throw new Error('Local firmware package must live inside the workspace dist directory.');
  }

  const fileName = basename(resolvedPackagePath);
  if (!LOCAL_DIRECT_PACKAGE_PATTERN.test(fileName)) {
    throw new Error('Local firmware package must be an hx01 direct-update JSON artifact.');
  }

  const stat = statSync(resolvedPackagePath);
  if (!stat.isFile()) {
    throw new Error(`Local firmware package is not a file: ${resolvedPackagePath}`);
  }

  return resolvedPackagePath;
};

export const readLocalFirmwarePackageText = (
  configuredPath = process.env[DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV] ?? '',
  workspaceRoot = resolve(process.cwd()),
): LocalFirmwarePackageSource | null => {
  const packagePath = resolveLocalFirmwarePackagePath(configuredPath, workspaceRoot);
  if (!packagePath) {
    return null;
  }

  return {
    packagePath,
    packageText: readFileSync(packagePath, 'utf8'),
  };
};

export const loadLocalFirmwarePackageMetadata = (
  configuredPath = process.env[DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV] ?? '',
  workspaceRoot = resolve(process.cwd()),
): LocalFirmwarePackageMetadata | null => {
  const source = readLocalFirmwarePackageText(configuredPath, workspaceRoot);
  if (!source) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source.packageText) as unknown;
  } catch {
    throw new Error(`Local firmware package is not valid JSON: ${source.packagePath}`);
  }

  if (!isLocalFirmwarePackage(parsed)) {
    throw new Error(`Local firmware package is malformed: ${source.packagePath}`);
  }

  const releaseRank = computeReleaseRank(parsed.version);
  if (releaseRank === null) {
    throw new Error(`Local firmware package version is invalid: ${parsed.version}`);
  }

  return {
    ...source,
    version: parsed.version,
    releaseRank,
    sha256: createHash('sha256').update(source.packageText).digest('hex'),
    downloadUrl: DEVICE_FIRMWARE_LOCAL_PACKAGE_ROUTE,
    notes: `Local development package from ${basename(source.packagePath)}.`,
  };
};
