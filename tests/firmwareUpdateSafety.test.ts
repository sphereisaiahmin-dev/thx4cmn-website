import assert from 'node:assert/strict';
import test from 'node:test';

import {
  sha256Hex,
  shouldUseLegacyRecoveryForError,
  validateFirmwarePackageText,
} from '../src/lib/firmwareUpdateSafety.ts';

const samplePackageText = `${JSON.stringify(
  {
    version: '0.9.4',
    files: [
      {
        path: '/code.py',
        contentBase64: 'cHJpbnQoImhpIik=',
        sha256: 'a'.repeat(64),
      },
    ],
  },
  null,
  2,
)}\n`;

test('legacy fallback signatures are version-gated', () => {
  assert.equal(
    shouldUseLegacyRecoveryForError(
      '0.9.0',
      'Timed out waiting for response to firmware_begin',
    ),
    true,
  );
  assert.equal(shouldUseLegacyRecoveryForError('0.9.0', 'Unhandled protocol exception'), false);
  assert.equal(shouldUseLegacyRecoveryForError('0.9.1', 'Unhandled protocol exception'), true);
  assert.equal(
    shouldUseLegacyRecoveryForError('0.9.1', 'Some unrelated network failure'),
    false,
  );
  assert.equal(shouldUseLegacyRecoveryForError('1.0.0', 'Unhandled protocol exception'), false);
});

test('validateFirmwarePackageText accepts matching hash and version', async () => {
  const expectedHash = await sha256Hex(samplePackageText);
  const validated = await validateFirmwarePackageText(samplePackageText, expectedHash, '0.9.4');

  assert.equal(validated.sha256, expectedHash);
  assert.equal(validated.packagePayload.version, '0.9.4');
});

test('validateFirmwarePackageText rejects hash mismatch', async () => {
  await assert.rejects(async () => {
    await validateFirmwarePackageText(samplePackageText, 'f'.repeat(64), '0.9.4');
  }, /hash mismatch/i);
});

test('validateFirmwarePackageText rejects version mismatch', async () => {
  const expectedHash = await sha256Hex(samplePackageText);

  await assert.rejects(async () => {
    await validateFirmwarePackageText(samplePackageText, expectedHash, '0.9.9');
  }, /version mismatch/i);
});
