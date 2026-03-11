export interface FirmwarePackageFile {
  path: string;
  contentBase64: string;
  sha256: string;
}

export interface FirmwarePackagePayload {
  version: string;
  files: FirmwarePackageFile[];
}

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

const LEGACY_RECOVERY_SIGNATURES: Record<string, RegExp[]> = {
  '0.9.0': [/timed out waiting for response to firmware_begin/i],
  '0.9.1': [
    /unhandled protocol exception/i,
    /legacy firmware_commit crash/i,
    /device rebooted during firmware_commit/i,
  ],
  '0.9.3': [
    /unhandled protocol exception/i,
    /legacy firmware_commit crash/i,
    /device rebooted during firmware_commit/i,
  ],
};

const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);

const isFirmwarePackage = (candidate: unknown): candidate is FirmwarePackagePayload => {
  if (!isRecord(candidate)) {
    return false;
  }

  if (typeof candidate.version !== 'string' || !Array.isArray(candidate.files) || candidate.files.length === 0) {
    return false;
  }

  return candidate.files.every((file) => {
    if (!isRecord(file)) {
      return false;
    }

    return (
      typeof file.path === 'string' &&
      file.path.length > 0 &&
      typeof file.contentBase64 === 'string' &&
      file.contentBase64.length > 0 &&
      typeof file.sha256 === 'string' &&
      SHA256_HEX_PATTERN.test(file.sha256)
    );
  });
};

export const shouldUseLegacyRecoveryForError = (firmwareVersion: string, errorMessage: string) => {
  const signatures = LEGACY_RECOVERY_SIGNATURES[firmwareVersion];
  if (!signatures || !errorMessage.trim()) {
    return false;
  }

  return signatures.some((pattern) => pattern.test(errorMessage));
};

export const sha256Hex = async (value: string) => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 is unavailable in this environment.');
  }

  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const validateFirmwarePackageText = async (
  packageText: string,
  expectedSha256: string,
  expectedVersion: string,
) => {
  const normalizedExpectedHash = expectedSha256.trim().toLowerCase();
  if (!SHA256_HEX_PATTERN.test(normalizedExpectedHash)) {
    throw new Error('Firmware manifest hash is invalid.');
  }

  if (!expectedVersion.trim()) {
    throw new Error('Firmware target version is unavailable.');
  }

  const computedHash = await sha256Hex(packageText);
  if (computedHash !== normalizedExpectedHash) {
    throw new Error('Firmware package hash mismatch.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(packageText) as unknown;
  } catch {
    throw new Error('Firmware package payload is not valid JSON.');
  }

  if (!isFirmwarePackage(parsed)) {
    throw new Error('Firmware package payload is malformed.');
  }

  if (parsed.version !== expectedVersion) {
    throw new Error(
      `Firmware package version mismatch (expected ${expectedVersion}, received ${parsed.version}).`,
    );
  }

  return {
    packagePayload: parsed,
    sha256: computedHash,
  };
};
