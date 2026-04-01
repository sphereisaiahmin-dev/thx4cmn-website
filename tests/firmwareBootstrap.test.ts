import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  BOOTSTRAP_MANIFEST_FILENAME,
  buildFirmwareBootstrapArtifact,
  collectBootstrapFiles,
  deployFirmwareBootstrap,
  getFirmwareSourceDir,
  selectCircuitPythonBoard,
} from '../scripts/firmware-bootstrap-utils.mjs';

const workspaceRoot = process.cwd();
const sourceDir = getFirmwareSourceDir(workspaceRoot);

const withTempDir = async (run: (dir: string) => Promise<void> | void) => {
  const dir = mkdtempSync(join(tmpdir(), 'hx01-bootstrap-'));
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const buildArtifactInTempDir = (dir: string) => {
  const artifactDir = resolve(dir, 'artifact');
  return buildFirmwareBootstrapArtifact({
    workspaceRoot,
    sourceDir,
    outputDir: artifactDir,
  });
};

test('buildFirmwareBootstrapArtifact stages root firmware files and the vendored lib tree', async () => {
  await withTempDir((dir) => {
    const outputDir = resolve(dir, 'artifact');
    const artifact = buildFirmwareBootstrapArtifact({
      workspaceRoot,
      sourceDir,
      outputDir,
    });

    const expectedFiles = collectBootstrapFiles(sourceDir).map((file) => file.relativePath);
    assert.deepEqual(artifact.manifest.managedPaths, expectedFiles);
    assert.ok(existsSync(resolve(outputDir, BOOTSTRAP_MANIFEST_FILENAME)));
    assert.ok(existsSync(resolve(outputDir, 'boot.py')));
    assert.ok(existsSync(resolve(outputDir, 'code.py')));
    assert.ok(existsSync(resolve(outputDir, 'protocol_v1.py')));
    assert.ok(existsSync(resolve(outputDir, 'settings.toml')));
    assert.ok(existsSync(resolve(outputDir, 'lib', 'keybow2040.py')));
    assert.ok(existsSync(resolve(outputDir, 'lib', 'keybow_hardware', 'pim551.py')));
    assert.equal(artifact.manifest.files.length, expectedFiles.length);
  });
});

test('deployFirmwareBootstrap requires an explicit board for RP2350 bootloader targets', async () => {
  await withTempDir(async (dir) => {
    const artifact = buildArtifactInTempDir(dir);
    const targetDir = resolve(dir, 'target-rp2350');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(
      resolve(targetDir, 'INFO_UF2.TXT'),
      'UF2 Bootloader v1.0\nModel: Raspberry Pi RP2350\nBoard-ID: RP2350\n',
      'utf8',
    );

    const result = await deployFirmwareBootstrap({
      artifactDir: artifact.artifactDir,
      targetDir,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'board_required');
    assert.match(result.message, /pico2/i);
    assert.match(result.message, /pico2_w/i);
    assert.equal(existsSync(resolve(targetDir, 'boot.py')), false);
  });
});

test('selectCircuitPythonBoard accepts explicit pico2_w for RP2350 targets', () => {
  const selection = selectCircuitPythonBoard({
    boardFamily: 'rp2350',
    requestedBoard: 'pico2_w',
  });

  assert.equal(selection.ok, true);
  if (selection.ok) {
    assert.equal(selection.boardKey, 'pico2_w');
  }
});

test('deployFirmwareBootstrap copies managed files to a CircuitPython target without deleting unrelated files', async () => {
  await withTempDir(async (dir) => {
    const artifact = buildArtifactInTempDir(dir);
    const targetDir = resolve(dir, 'circuitpy');
    mkdirSync(resolve(targetDir, 'lib'), { recursive: true });
    writeFileSync(
      resolve(targetDir, 'boot_out.txt'),
      'Adafruit CircuitPython 10.0.3 on 2025-10-17; Raspberry Pi Pico with rp2040\n',
      'utf8',
    );
    writeFileSync(resolve(targetDir, 'keep.txt'), 'keep me\n', 'utf8');
    writeFileSync(resolve(targetDir, 'lib', 'custom-module.py'), 'value = 1\n', 'utf8');

    const result = await deployFirmwareBootstrap({
      artifactDir: artifact.artifactDir,
      targetDir,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'deployed');
    assert.equal(result.managedPaths.length, artifact.manifest.managedPaths.length);
    assert.equal(readFileSync(resolve(targetDir, 'keep.txt'), 'utf8'), 'keep me\n');
    assert.equal(readFileSync(resolve(targetDir, 'lib', 'custom-module.py'), 'utf8'), 'value = 1\n');
    assert.equal(
      readFileSync(resolve(targetDir, 'boot.py'), 'utf8'),
      readFileSync(resolve(sourceDir, 'boot.py'), 'utf8'),
    );
    assert.equal(
      readFileSync(resolve(targetDir, 'protocol_v1.py'), 'utf8'),
      readFileSync(resolve(sourceDir, 'protocol_v1.py'), 'utf8'),
    );
    assert.ok(existsSync(resolve(targetDir, 'settings.toml')));
    assert.ok(existsSync(resolve(targetDir, 'lib', 'keybow2040.py')));
    assert.match(result.message, /USB storage is expected to disappear|re-enumerate/i);
  });
});
