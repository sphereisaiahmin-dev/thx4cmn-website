import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = resolve(process.cwd());
const sourceDir = resolve(workspaceRoot, 'thxcmididevicecode');
const distDir = resolve(workspaceRoot, 'dist');

const requiredFiles = ['boot.py', 'code.py', 'protocol_v1.py'];

const getFirmwareVersion = (codeFilePath) => {
  const source = readFileSync(codeFilePath, 'utf8');
  const match = source.match(/FIRMWARE_VERSION\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`Unable to read FIRMWARE_VERSION from ${codeFilePath}.`);
  }
  return match[1];
};

for (const requiredFile of requiredFiles) {
  const candidate = resolve(sourceDir, requiredFile);
  statSync(candidate);
}

const firmwareVersion = getFirmwareVersion(resolve(sourceDir, 'code.py'));
const outputZipPath = resolve(distDir, `thx-c-firmware-${firmwareVersion}-bridge.zip`);
mkdirSync(distDir, { recursive: true });

const stagingDir = mkdtempSync(join(tmpdir(), 'thx-c-firmware-bridge-'));
try {
  for (const requiredFile of requiredFiles) {
    copyFileSync(resolve(sourceDir, requiredFile), resolve(stagingDir, requiredFile));
  }

  const updateInstructions = `# thx-c Firmware Bridge ${firmwareVersion}

Use this package to bridge devices on firmware 2.4.x to ${firmwareVersion}.

## Included files
- boot.py
- code.py
- protocol_v1.py

## Flash steps (serial / ampy)
1. Connect the thx-c device and find its port (example: /dev/cu.usbmodem101).
2. Upload files in this exact order:

\`\`\`bash
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 put protocol_v1.py /protocol_v1.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 put code.py /code.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 put boot.py /boot.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 reset
\`\`\`

3. Reconnect the device and verify firmwareVersion reports ${firmwareVersion}.
`;

  writeFileSync(resolve(stagingDir, 'UPDATE.md'), updateInstructions, 'utf8');

  rmSync(outputZipPath, { force: true });
  const zipResult = spawnSync(
    'zip',
    ['-q', '-j', outputZipPath, ...requiredFiles, 'UPDATE.md'],
    {
      cwd: stagingDir,
      stdio: 'pipe',
    },
  );

  if (zipResult.status !== 0) {
    throw new Error(`zip failed: ${zipResult.stderr.toString('utf8')}`);
  }

  const zipBuffer = readFileSync(outputZipPath);
  const sha256 = createHash('sha256').update(zipBuffer).digest('hex');

  const output = {
    firmwareVersion,
    sourceDir,
    outputZipPath,
    sha256,
    files: [...requiredFiles, 'UPDATE.md'].map((filename) => basename(filename)),
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
