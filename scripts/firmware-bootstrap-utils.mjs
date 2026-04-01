import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export const FIRMWARE_SOURCE_DIRNAME = 'thxcmididevicecode';
export const BOOTSTRAP_MANIFEST_FILENAME = 'bootstrap-manifest.json';
export const BOOTSTRAP_REQUIRED_ROOT_FILES = ['boot.py', 'code.py', 'midi_note_utils.py', 'protocol_v1.py'];
export const BOOTSTRAP_OPTIONAL_ROOT_FILES = ['settings.toml'];

export const CIRCUITPYTHON_BOARDS = {
  pico: {
    boardId: 'raspberry_pi_pico',
    boardFamily: 'rp2040',
    label: 'Pico / RP2040',
  },
  pico_w: {
    boardId: 'raspberry_pi_pico_w',
    boardFamily: 'rp2040',
    label: 'Pico W / RP2040',
  },
  pico2: {
    boardId: 'raspberry_pi_pico2',
    boardFamily: 'rp2350',
    label: 'Pico 2 / RP2350',
  },
  pico2_w: {
    boardId: 'raspberry_pi_pico2_w',
    boardFamily: 'rp2350',
    label: 'Pico 2 W / RP2350',
  },
};

const CIRCUITPYTHON_DOWNLOAD_URLS = {
  rp2040: 'https://circuitpython.org/board/raspberry_pi_pico/',
  rp2350: 'https://circuitpython.org/board/raspberry_pi_pico2/',
  unknown: 'https://circuitpython.org/downloads',
};

const CIRCUITPYTHON_BOARD_CHOICES = Object.keys(CIRCUITPYTHON_BOARDS);
const DEFAULT_BOARD_BY_FAMILY = {
  rp2040: 'pico',
};

const CIRCUITPYTHON_BOARD_PAGE_BASE = 'https://circuitpython.org/board/';
const STABLE_UF2_LINK_PATTERN = /<a[^>]+href="([^"]+\.uf2)"[^>]*>\s*DOWNLOAD \.UF2 NOW\s*<\/a>/i;
const FALLBACK_UF2_LINK_PATTERN = /href="([^"]+\.uf2)"/i;
const HIDDEN_STORAGE_REMOUNT_TIMEOUT_ERROR = 'Timed out waiting for CircuitPython to remount as CIRCUITPY.';
const WINDOWS_CIRCUITPYTHON_PORT_INSTANCE_PATTERN = '^USB\\\\VID_2E8A&PID_000B&MI_00\\\\';

const sha256Hex = (buffer) => createHash('sha256').update(buffer).digest('hex');

const toPortableRelativePath = (value) => value.replace(/\\/g, '/');

const sleep = (ms) =>
  new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

const isWindows = process.platform === 'win32';

const escapePowerShellSingleQuotedString = (value) => `${value}`.replace(/'/g, "''");

const normalizeConsolePort = (candidate = '') => candidate.trim().toUpperCase();

const runWindowsPowerShell = (script) => {
  if (!isWindows) {
    throw new Error('Windows PowerShell recovery is only available on Windows hosts.');
  }

  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
};

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

const decodeHtmlEntities = (value) => value.replace(/&amp;/g, '&');

const normalizeBoardChoice = (candidate = '') => candidate.trim().toLowerCase().replace(/-/g, '_');

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

export const resolveCircuitPythonBoard = (board) => {
  const normalized = normalizeBoardChoice(board);
  if (!normalized) {
    return null;
  }

  return CIRCUITPYTHON_BOARDS[normalized] ?? null;
};

export const selectCircuitPythonBoard = ({ boardFamily, requestedBoard = '' }) => {
  const normalizedBoard = normalizeBoardChoice(requestedBoard);
  if (normalizedBoard) {
    const board = resolveCircuitPythonBoard(normalizedBoard);
    if (!board) {
      return {
        ok: false,
        status: 'invalid_board',
        message: `Unsupported --board "${requestedBoard}". Use one of ${CIRCUITPYTHON_BOARD_CHOICES.join(', ')}.`,
      };
    }

    if (boardFamily !== 'unknown' && board.boardFamily !== boardFamily) {
      return {
        ok: false,
        status: 'board_family_mismatch',
        message: `${board.label} does not match the detected ${describeBoardFamily(boardFamily)} bootloader target.`,
      };
    }

    return {
      ok: true,
      boardKey: normalizedBoard,
      board,
      defaulted: false,
    };
  }

  const defaultBoardKey = DEFAULT_BOARD_BY_FAMILY[boardFamily];
  if (defaultBoardKey) {
    return {
      ok: true,
      boardKey: defaultBoardKey,
      board: CIRCUITPYTHON_BOARDS[defaultBoardKey],
      defaulted: true,
    };
  }

  if (boardFamily === 'rp2350') {
    return {
      ok: false,
      status: 'board_required',
      message:
        'RP2350 BOOTSEL targets require an explicit board choice. Re-run with --board pico2 or --board pico2_w so the correct CircuitPython UF2 can be installed first.',
    };
  }

  return {
    ok: false,
    status: 'board_required',
    message: `Unable to determine which CircuitPython build to flash for ${describeBoardFamily(
      boardFamily,
    )}. Re-run with --board ${CIRCUITPYTHON_BOARD_CHOICES.join('|')}.`,
  };
};

const extractStableUf2DownloadUrl = (html, pageUrl) => {
  const stableMatch = html.match(STABLE_UF2_LINK_PATTERN);
  const matchedHref = stableMatch?.[1] ?? html.match(FALLBACK_UF2_LINK_PATTERN)?.[1] ?? '';
  if (!matchedHref) {
    throw new Error(`Unable to locate a stable CircuitPython UF2 on ${pageUrl}.`);
  }

  return new URL(decodeHtmlEntities(matchedHref), pageUrl).toString();
};

export const fetchLatestStableUf2Release = async (boardKey) => {
  const board = resolveCircuitPythonBoard(boardKey);
  if (!board) {
    throw new Error(`Unsupported board "${boardKey}".`);
  }

  const pageUrl = new URL(`${board.boardId}/`, CIRCUITPYTHON_BOARD_PAGE_BASE).toString();
  const pageResponse = await fetch(pageUrl, { cache: 'no-store' });
  if (!pageResponse.ok) {
    throw new Error(`Unable to load CircuitPython board page (${pageResponse.status}): ${pageUrl}`);
  }

  const html = await pageResponse.text();
  const downloadUrl = extractStableUf2DownloadUrl(html, pageUrl);
  const fileName = basename(new URL(downloadUrl).pathname);

  const uf2Response = await fetch(downloadUrl, { cache: 'no-store' });
  if (!uf2Response.ok) {
    throw new Error(`Unable to download CircuitPython UF2 (${uf2Response.status}): ${downloadUrl}`);
  }

  const uf2Bytes = Buffer.from(await uf2Response.arrayBuffer());

  return {
    boardKey,
    board,
    pageUrl,
    downloadUrl,
    fileName,
    uf2Bytes,
  };
};

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

export const listMountedDriveRoots = () => {
  const roots = [];
  for (let code = 65; code <= 90; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`;
    if (existsSync(root)) {
      roots.push(root);
    }
  }

  return roots;
};

export const listProvisioningTargets = () =>
  listMountedDriveRoots()
    .map((root) => {
      try {
        return inspectProvisioningTarget(root);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

export const waitForCircuitPythonTarget = async ({
  previousTargets = [],
  preferredTargetDir = '',
  timeoutMs = 180000,
  pollMs = 750,
} = {}) => {
  const deadline = Date.now() + timeoutMs;
  const previousCircuitPythonTargets = new Set(
    previousTargets
      .filter((target) => target?.state === 'circuitpython_filesystem')
      .map((target) => target.targetDir.toLowerCase()),
  );
  const preferredNormalized = preferredTargetDir ? resolve(preferredTargetDir).toLowerCase() : '';

  while (Date.now() < deadline) {
    const currentTargets = listProvisioningTargets();
    const circuitPythonTargets = currentTargets.filter(
      (target) => target.state === 'circuitpython_filesystem',
    );

    if (preferredNormalized) {
      const preferredTarget = circuitPythonTargets.find(
        (target) => target.targetDir.toLowerCase() === preferredNormalized,
      );
      if (preferredTarget) {
        return preferredTarget;
      }
    }

    const newTargets = circuitPythonTargets.filter(
      (target) => !previousCircuitPythonTargets.has(target.targetDir.toLowerCase()),
    );
    if (newTargets.length > 0) {
      return newTargets[0];
    }

    if (circuitPythonTargets.length === 1 && previousCircuitPythonTargets.size === 0) {
      return circuitPythonTargets[0];
    }

    await sleep(pollMs);
  }

  throw new Error(HIDDEN_STORAGE_REMOUNT_TIMEOUT_ERROR);
};

const copyManagedFiles = ({ artifactDir, targetDir, managedPaths }) => {
  for (const relativePath of managedPaths) {
    const sourcePath = resolve(artifactDir, relativePath);
    const destinationPath = resolve(targetDir, relativePath);
    const destinationDir = dirname(destinationPath);
    if (!existsSync(destinationDir)) {
      mkdirSync(destinationDir, { recursive: true });
    }
    copyFileSync(sourcePath, destinationPath);
  }
};

const writeUf2ToBootloader = async ({ boardKey, targetDir }) => {
  const release = await fetchLatestStableUf2Release(boardKey);
  const tempDir = resolve(mkdtempSync(join(tmpdir(), 'hx01-circuitpython-')));
  const tempUf2Path = resolve(tempDir, release.fileName);

  try {
    writeFileSync(tempUf2Path, release.uf2Bytes);
    copyFileSync(tempUf2Path, resolve(targetDir, release.fileName));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  return release;
};

const resolveWindowsCircuitPythonConsolePort = ({ requestedPort = '' } = {}) => {
  const normalizedRequestedPort = normalizeConsolePort(requestedPort);
  if (normalizedRequestedPort) {
    return normalizedRequestedPort;
  }

  const script = `
$ports = Get-PnpDevice | Where-Object {
  $_.Status -eq 'OK' -and
  $_.Class -eq 'Ports' -and
  $_.InstanceId -match '${WINDOWS_CIRCUITPYTHON_PORT_INSTANCE_PATTERN}'
}
$resolved = @()
foreach ($candidate in $ports) {
  $friendlyName = [string]$candidate.FriendlyName
  if ($friendlyName -match '\\((COM\\d+)\\)') {
    $resolved += $Matches[1]
  }
}
$resolved | Select-Object -Unique | ForEach-Object { Write-Output $_ }
`;

  const output = runWindowsPowerShell(script);
  const ports = output
    .split(/\r?\n/u)
    .map((value) => normalizeConsolePort(value))
    .filter(Boolean);

  if (ports.length === 1) {
    return ports[0];
  }

  if (ports.length === 0) {
    return null;
  }

  throw new Error(
    `Multiple CircuitPython console ports are present (${ports.join(
      ', ',
    )}). Re-run with --console-port COMx so the recovery step targets the correct board.`,
  );
};

const runCircuitPythonConsoleCommandWindows = ({
  port,
  commandLines,
  settleBeforeMs = 500,
  settleBetweenMs = 400,
  finalSettleMs = 1000,
} = {}) => {
  const normalizedPort = normalizeConsolePort(port);
  if (!normalizedPort) {
    throw new Error('A Windows CircuitPython console port is required.');
  }

  const quotedCommands = commandLines
    .map((command) => `  '${escapePowerShellSingleQuotedString(command)}'`)
    .join(',\n');

  const script = `
$commands = @(
${quotedCommands}
)
$port = New-Object System.IO.Ports.SerialPort '${escapePowerShellSingleQuotedString(normalizedPort)}',115200,'None',8,'one'
$port.ReadTimeout = 1500
$port.WriteTimeout = 1500
$port.DtrEnable = $true
try {
  $port.Open()
  Start-Sleep -Milliseconds ${settleBeforeMs}
  $port.DiscardInBuffer()
  $port.Write((([char]3).ToString() + [char]3 + "\`r\`n"))
  Start-Sleep -Milliseconds 800
  try { $null = $port.ReadExisting() } catch {}
  $port.Write("\`r\`n")
  Start-Sleep -Milliseconds 400
  try { $null = $port.ReadExisting() } catch {}
  foreach ($command in $commands) {
    try { $port.Write($command + "\`r\`n") } catch { break }
    Start-Sleep -Milliseconds ${settleBetweenMs}
    try { $null = $port.ReadExisting() } catch { break }
  }
  Start-Sleep -Milliseconds ${finalSettleMs}
  try { $null = $port.ReadExisting() } catch {}
} finally {
  if ($port.IsOpen) {
    $port.Close()
  }
}
`;

  runWindowsPowerShell(script);
};

const recoverHiddenCircuitPythonFilesystem = async ({
  previousTargets = [],
  preferredTargetDir = '',
  consolePort = '',
  timeoutMs = 180000,
} = {}) => {
  if (!isWindows) {
    return {
      ok: false,
      message:
        'The board likely rebooted into an existing CircuitPython filesystem whose boot.py is hiding USB storage. On Windows you can rerun with --console-port COMx to erase that filesystem automatically.',
    };
  }

  let port = null;
  try {
    port = resolveWindowsCircuitPythonConsolePort({ requestedPort: consolePort });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unable to resolve the CircuitPython console port.',
    };
  }

  if (!port) {
    return {
      ok: false,
      message:
        'No active CircuitPython console port was found after flashing the runtime. If the board rebooted into old code, rerun with --console-port COMx so the tool can erase the previous filesystem and remount CIRCUITPY.',
    };
  }

  let recoveryCommandError = null;
  try {
    runCircuitPythonConsoleCommandWindows({
      port,
      commandLines: ['import storage', 'storage.erase_filesystem()'],
      finalSettleMs: 1200,
    });
  } catch (error) {
    recoveryCommandError = error instanceof Error ? error : new Error('The filesystem erase step failed.');
  }

  try {
    const target = await waitForCircuitPythonTarget({
      previousTargets,
      preferredTargetDir,
      timeoutMs,
    });
    return {
      ok: true,
      port,
      target,
    };
  } catch (error) {
    const recoveryPrefix = recoveryCommandError
      ? `The filesystem erase step on ${port} reported an error: ${recoveryCommandError.message} `
      : '';
    return {
      ok: false,
      message:
        error instanceof Error
          ? `${recoveryPrefix}The recovery port ${port} did not remount CIRCUITPY: ${error.message}`
          : `${recoveryPrefix}The recovery port ${port} did not remount CIRCUITPY.`,
    };
  }
};

export const deployFirmwareBootstrap = async ({
  artifactDir,
  targetDir,
  board = '',
  consolePort = '',
  timeoutMs = 180000,
}) => {
  const resolvedArtifactDir = resolve(artifactDir);
  const resolvedTargetDir = resolve(normalizeProvisioningTarget(targetDir));
  const { manifest } = readBootstrapManifest(resolvedArtifactDir);
  let target = inspectProvisioningTarget(resolvedTargetDir);
  let flashedRuntime = null;

  if (target.state === 'uf2_bootloader') {
    const boardSelection = selectCircuitPythonBoard({
      boardFamily: target.boardFamily,
      requestedBoard: board,
    });

    if (!boardSelection.ok) {
      return {
        ok: false,
        status: boardSelection.status,
        artifactDir: resolvedArtifactDir,
        targetDir: resolvedTargetDir,
        boardFamily: target.boardFamily,
        downloadUrl: target.downloadUrl,
        message: boardSelection.message,
      };
    }

    let previousTargets = [];
    try {
      previousTargets = listProvisioningTargets();
      const release = await writeUf2ToBootloader({
        boardKey: boardSelection.boardKey,
        targetDir: resolvedTargetDir,
      });
      flashedRuntime = {
        boardKey: boardSelection.boardKey,
        board: boardSelection.board,
        downloadUrl: release.downloadUrl,
        pageUrl: release.pageUrl,
      };
      target = await waitForCircuitPythonTarget({
        previousTargets,
        preferredTargetDir: resolvedTargetDir,
        timeoutMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to install CircuitPython.';

      if (message === HIDDEN_STORAGE_REMOUNT_TIMEOUT_ERROR) {
        const recoveredTarget = await recoverHiddenCircuitPythonFilesystem({
          previousTargets,
          preferredTargetDir: resolvedTargetDir,
          consolePort,
          timeoutMs,
        });

        if (recoveredTarget.ok) {
          target = recoveredTarget.target;
          flashedRuntime = {
            ...flashedRuntime,
            recoveredConsolePort: recoveredTarget.port,
          };
        } else {
          return {
            ok: false,
            status: 'runtime_flash_failed',
            artifactDir: resolvedArtifactDir,
            targetDir: resolvedTargetDir,
            boardFamily: target.boardFamily,
            message: `${message} ${recoveredTarget.message}`,
          };
        }
      } else {
        return {
          ok: false,
          status: 'runtime_flash_failed',
          artifactDir: resolvedArtifactDir,
          targetDir: resolvedTargetDir,
          boardFamily: target.boardFamily,
          message,
        };
      }
    }
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

  copyManagedFiles({
    artifactDir: resolvedArtifactDir,
    targetDir: target.targetDir,
    managedPaths: manifest.managedPaths,
  });

  const message = flashedRuntime
    ? `Installed CircuitPython for ${flashedRuntime.board.label} and copied ${manifest.managedPaths.length} managed hx01 files to ${target.targetDir}. Reset or reconnect once so boot.py can hide USB storage and re-enumerate the device as hx01 serial/MIDI.`
    : `Copied ${manifest.managedPaths.length} managed hx01 files to ${target.targetDir}. After reboot, USB storage is expected to disappear and the device should enumerate as hx01 serial/MIDI.`;

  return {
    ok: true,
    status: flashedRuntime ? 'flashed_and_deployed' : 'deployed',
    artifactDir: resolvedArtifactDir,
    targetDir: target.targetDir,
    boardFamily: target.boardFamily,
    circuitPythonBoard: flashedRuntime?.boardKey ?? null,
    managedPaths: [...manifest.managedPaths],
    version: manifest.version,
    message,
  };
};
