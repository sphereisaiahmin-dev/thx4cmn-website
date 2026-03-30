import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV,
  DEVICE_FIRMWARE_LOCAL_PACKAGE_ROUTE,
  loadLocalFirmwarePackageMetadata,
  readLocalFirmwarePackageText,
} from '../src/lib/deviceFirmwareLocalPackage.ts';
import {
  buildLatestFirmwareResponse,
  buildUnavailableLatestFirmwareResponse,
} from '../src/lib/deviceFirmwareLookup.ts';

const localPackagePayload = {
  version: '0.9.5',
  files: [
    {
      path: '/code.py',
      contentBase64: Buffer.from('print("patched")\n', 'utf8').toString('base64'),
      sha256: 'a'.repeat(64),
    },
    {
      path: '/protocol_v1.py',
      contentBase64: Buffer.from('PROTOCOL_VERSION = 1\n', 'utf8').toString('base64'),
      sha256: 'b'.repeat(64),
    },
  ],
};

const withLocalFirmwareWorkspace = async (
  callback: (context: {
    packageText: string;
    packagePath: string;
    packageSha256: string;
  }) => Promise<void>,
) => {
  const packageText = `${JSON.stringify(localPackagePayload, null, 2)}\n`;
  const packageSha256 = createHash('sha256').update(packageText).digest('hex');
  const tempRoot = mkdtempSync(join(tmpdir(), 'hx01-local-fw-'));
  const distDir = join(tempRoot, 'dist');
  const packagePath = join(distDir, 'hx01-firmware-0.9.5-direct.json');
  const originalCwd = process.cwd();
  const originalEnv = process.env[DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV];

  mkdirSync(distDir, { recursive: true });
  writeFileSync(packagePath, packageText, 'utf8');

  process.chdir(tempRoot);
  process.env[DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV] = 'dist/hx01-firmware-0.9.5-direct.json';

  try {
    await callback({ packageText, packagePath, packageSha256 });
  } finally {
    if (originalEnv === undefined) {
      delete process.env[DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV];
    } else {
      process.env[DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV] = originalEnv;
    }
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

test('local firmware package metadata exposes the configured package', async () => {
  await withLocalFirmwareWorkspace(async ({ packageSha256 }) => {
    const metadata = loadLocalFirmwarePackageMetadata();
    assert.ok(metadata);
    assert.equal(metadata.version, '0.9.5');
    assert.equal(metadata.releaseRank, 50905);
    assert.equal(metadata.downloadUrl, DEVICE_FIRMWARE_LOCAL_PACKAGE_ROUTE);
    assert.equal(metadata.sha256, packageSha256);
  });
});

test('local firmware package reader returns the configured package text', async () => {
  await withLocalFirmwareWorkspace(async ({ packageText }) => {
    const source = readLocalFirmwarePackageText();
    assert.ok(source);
    assert.equal(source.packageText, packageText);
  });
});

test('latest firmware lookup can build an unavailable fallback response', async () => {
  const response = buildUnavailableLatestFirmwareResponse('0.9.4', 50904);

  assert.equal(response.updateAvailable, false);
  assert.equal(response.strategy, 'none');
  assert.equal(response.currentVersion, '0.9.4');
  assert.equal(response.latestVersion, '0.9.4');
  assert.match(response.notes ?? '', /unavailable/i);
});

test('latest firmware lookup accepts canonical hx01 even when manifest metadata differs', async () => {
  const response = await buildLatestFirmwareResponse({
    currentVersion: '0.9.4',
    device: 'hx01',
    manifest: {
      device: 'legacy-hx-device',
      generatedAt: new Date().toISOString(),
      latestVersion: '0.9.5',
      latestReleaseRank: 50905,
      releases: [
        {
          version: '0.9.5',
          releaseRank: 50905,
          downloadUrl: 'https://example.r2.cloudflarestorage.com/updates/hx01-firmware-0.9.5-direct.json',
          sha256: 'c'.repeat(64),
          strategy: 'direct_flash' as const,
        },
      ],
    },
  });

  assert.equal(response.updateAvailable, true);
  assert.equal(response.targetVersion, '0.9.5');
  assert.equal(response.latestVersion, '0.9.5');
});

test('local firmware package reader returns null when no local artifact is configured', async () => {
  const originalEnv = process.env[DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV];
  delete process.env[DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV];

  try {
    assert.equal(readLocalFirmwarePackageText(), null);
  } finally {
    if (originalEnv === undefined) {
      delete process.env[DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV];
    } else {
      process.env[DEVICE_FIRMWARE_LOCAL_PACKAGE_PATH_ENV] = originalEnv;
    }
  }
});
