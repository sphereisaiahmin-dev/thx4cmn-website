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
