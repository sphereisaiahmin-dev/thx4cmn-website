import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const FIRMWARE_SOURCE_DIRNAME = 'thxcmididevicecode';
export const BOOTSTRAP_MANIFEST_FILENAME = 'bootstrap-manifest.json';
export const BOOTSTRAP_REQUIRED_ROOT_FILES = ['boot.py', 'code.py', 'protocol_v1.py'];
export const BOOTSTRAP_OPTIONAL_ROOT_FILES = ['settings.toml'];

const CIRCUITPYTHON_DOWNLOAD_URLS = {
  rp2040: 'https://circuitpython.org/board/raspberry_pi_pico/',
  rp2350: 'https://circuitpython.org/board/raspberry_pi_pico2/',
  unknown: 'https://circuitpython.org/downloads',
};

const sha256Hex = (buffer) => createHash('sha256').update(buffer).digest('hex');

const toPortableRelativePath = (value) => value.replace(/\\/g, '/');

const walkFiles = (dir, prefix = '') => {
  const discovered = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = join(dir, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      discovered.push(...walkFiles(absolutePath, relativePath));
      continue;
    }

    if (entry.isFile()) {
      discovered.push({
        absolutePath,
        relativePath: toPortableRelativePath(relativePath),
      });
    }
  }

  return discovered.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
};

export const getWorkspaceRoot = (cwd = process.cwd()) => resolve(cwd);

export const getFirmwareSourceDir = (workspaceRoot = getWorkspaceRoot()) =>
  resolve(workspaceRoot, FIRMWARE_SOURCE_DIRNAME);

export const getFirmwareVersion = (sourceDir) => {
  const codeFilePath = resolve(sourceDir, 'code.py');
  const source = readFileSync(codeFilePath, 'utf8');
  const match = source.match(/FIRMWARE_VERSION\s*=\s*"([^"]+)"/);

  if (!match) {
    throw new Error(`Unable to read FIRMWARE_VERSION from ${codeFilePath}.`);
  }

  return match[1];
};

export const collectBootstrapFiles = (sourceDir) => {
  const entries = [];

  for (const requiredFile of BOOTSTRAP_REQUIRED_ROOT_FILES) {
    const absolutePath = resolve(sourceDir, requiredFile);
    statSync(absolutePath);
    entries.push({
      absolutePath,
      relativePath: requiredFile,
    });
  }

  for (const optionalFile of BOOTSTRAP_OPTIONAL_ROOT_FILES) {
    const absolutePath = resolve(sourceDir, optionalFile);
    if (existsSync(absolutePath)) {
      entries.push({
        absolutePath,
        relativePath: optionalFile,
      });
    }
  }

  const libDir = resolve(sourceDir, 'lib');
  statSync(libDir);
  entries.push(...walkFiles(libDir, 'lib'));

  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
};

export const createBootstrapManifest = ({ version, sourceDir, files }) => ({
  version,
  sourceDir,
  managedPaths: files.map((file) => file.relativePath),
  files: files.map((file) => {
    const content = readFileSync(file.absolutePath);
    return {
      path: file.relativePath,
      size: content.length,
      sha256: sha256Hex(content),
    };
  }),
});

export const buildFirmwareBootstrapArtifact = ({
  workspaceRoot = getWorkspaceRoot(),
  sourceDir = getFirmwareSourceDir(workspaceRoot),
  outputDir,
} = {}) => {
  const version = getFirmwareVersion(sourceDir);
  const artifactDir = resolve(outputDir ?? join(workspaceRoot, 'dist', `hx01-firmware-${version}-bootstrap`));
  const files = collectBootstrapFiles(sourceDir);

  rmSync(artifactDir, { recursive: true, force: true });
  mkdirSync(artifactDir, { recursive: true });

  for (const file of files) {
    const destinationPath = resolve(artifactDir, file.relativePath);
    const destinationDir = dirname(destinationPath);
    if (!existsSync(destinationDir)) {
      mkdirSync(destinationDir, { recursive: true });
    }
    copyFileSync(file.absolutePath, destinationPath);
  }

  const manifest = createBootstrapManifest({ version, sourceDir, files });
  const manifestPath = resolve(artifactDir, BOOTSTRAP_MANIFEST_FILENAME);
  writeFileSync(`${manifestPath}`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return {
    version,
    artifactDir,
    manifestPath,
    manifest,
  };
};

export const readBootstrapManifest = (artifactDir) => {
  const manifestPath = resolve(artifactDir, BOOTSTRAP_MANIFEST_FILENAME);
  const candidate = JSON.parse(readFileSync(manifestPath, 'utf8'));

  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    typeof candidate.version !== 'string' ||
    !Array.isArray(candidate.managedPaths) ||
    !Array.isArray(candidate.files)
  ) {
    throw new Error(`Bootstrap manifest is malformed: ${manifestPath}.`);
  }

  return {
    manifestPath,
    manifest: candidate,
  };
};

export const detectBoardFamily = (text = '') => {
  if (/rp2350|pico 2/i.test(text)) {
    return 'rp2350';
  }

  if (/rp2040|rpi-rp2|raspberry pi pico\b/i.test(text)) {
    return 'rp2040';
  }

  return 'unknown';
};

export const describeBoardFamily = (boardFamily) => {
  if (boardFamily === 'rp2350') {
    return 'Pico 2 / RP2350';
  }

  if (boardFamily === 'rp2040') {
    return 'Pico / RP2040';
  }

  return 'unknown board';
};

export const resolveCircuitPythonDownloadUrl = (boardFamily) =>
  CIRCUITPYTHON_DOWNLOAD_URLS[boardFamily] ?? CIRCUITPYTHON_DOWNLOAD_URLS.unknown;

export const inspectProvisioningTarget = (targetDir) => {
  const resolvedTargetDir = resolve(targetDir);
  if (!existsSync(resolvedTargetDir)) {
    throw new Error(`Provisioning target does not exist: ${resolvedTargetDir}.`);
  }

  if (!lstatSync(resolvedTargetDir).isDirectory()) {
    throw new Error(`Provisioning target must be a directory: ${resolvedTargetDir}.`);
  }

  const uf2InfoPath = resolve(resolvedTargetDir, 'INFO_UF2.TXT');
  if (existsSync(uf2InfoPath)) {
    const metadata = readFileSync(uf2InfoPath, 'utf8');
    const boardFamily = detectBoardFamily(metadata);
    return {
      state: 'uf2_bootloader',
      targetDir: resolvedTargetDir,
      boardFamily,
      details: metadata.trim(),
      downloadUrl: resolveCircuitPythonDownloadUrl(boardFamily),
    };
  }

  const bootOutPath = resolve(resolvedTargetDir, 'boot_out.txt');
  if (existsSync(bootOutPath)) {
    const details = readFileSync(bootOutPath, 'utf8');
    return {
      state: 'circuitpython_filesystem',
      targetDir: resolvedTargetDir,
      boardFamily: detectBoardFamily(details),
      details: details.trim(),
      source: 'boot_out.txt',
    };
  }

  const circuitPythonMarkers = ['code.py', 'lib', 'settings.toml'];
  const matchedMarkers = circuitPythonMarkers.filter((marker) => existsSync(resolve(resolvedTargetDir, marker)));
  if (matchedMarkers.length > 0) {
    return {
      state: 'circuitpython_filesystem',
      targetDir: resolvedTargetDir,
      boardFamily: 'unknown',
      details: matchedMarkers.join(', '),
      source: 'markers',
    };
  }

  return {
    state: 'unknown',
    targetDir: resolvedTargetDir,
    boardFamily: 'unknown',
    details: '',
  };
};

export const normalizeProvisioningTarget = (candidate) => {
  const trimmed = `${candidate ?? ''}`.trim();
  if (!trimmed) {
    throw new Error('A target drive or directory is required.');
  }

  if (/^[A-Za-z]:$/.test(trimmed)) {
    return `${trimmed}\\`;
  }

  return trimmed;
};

export const deployFirmwareBootstrap = ({ artifactDir, targetDir }) => {
  const resolvedArtifactDir = resolve(artifactDir);
  const resolvedTargetDir = resolve(normalizeProvisioningTarget(targetDir));
  const { manifest } = readBootstrapManifest(resolvedArtifactDir);
  const target = inspectProvisioningTarget(resolvedTargetDir);

  if (target.state === 'uf2_bootloader') {
    return {
      ok: false,
      status: 'uf2_bootloader',
      artifactDir: resolvedArtifactDir,
      targetDir: resolvedTargetDir,
      boardFamily: target.boardFamily,
      downloadUrl: target.downloadUrl,
      message: `Target ${resolvedTargetDir} is the UF2 bootloader for ${describeBoardFamily(
        target.boardFamily,
      )}. Flash CircuitPython first from ${target.downloadUrl}, reconnect when the board mounts as CIRCUITPY, then rerun deploy:firmware-bootstrap.`,
    };
  }

  if (target.state !== 'circuitpython_filesystem') {
    return {
      ok: false,
      status: 'unknown_target',
      artifactDir: resolvedArtifactDir,
      targetDir: resolvedTargetDir,
      boardFamily: target.boardFamily,
      message: `Target ${resolvedTargetDir} does not look like a CircuitPython filesystem. Mount CIRCUITPY first, or if the board is blank hold BOOTSEL to reach the UF2 bootloader.`,
    };
  }

  for (const relativePath of manifest.managedPaths) {
    const sourcePath = resolve(resolvedArtifactDir, relativePath);
    const destinationPath = resolve(resolvedTargetDir, relativePath);
    const destinationDir = dirname(destinationPath);
    if (!existsSync(destinationDir)) {
      mkdirSync(destinationDir, { recursive: true });
    }
    copyFileSync(sourcePath, destinationPath);
  }

  return {
    ok: true,
    status: 'deployed',
    artifactDir: resolvedArtifactDir,
    targetDir: resolvedTargetDir,
    boardFamily: target.boardFamily,
    managedPaths: [...manifest.managedPaths],
    version: manifest.version,
    message: `Copied ${manifest.managedPaths.length} managed hx01 files to ${resolvedTargetDir}. After reboot, USB storage is expected to disappear and the device should enumerate as hx01 serial/MIDI.`,
  };
};
