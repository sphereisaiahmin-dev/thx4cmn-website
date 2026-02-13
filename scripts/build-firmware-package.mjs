import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
const outputJsonPath = resolve(distDir, `thx-c-firmware-${firmwareVersion}-direct.json`);

const files = requiredFiles.map((filename) => {
  const absolutePath = resolve(sourceDir, filename);
  const content = readFileSync(absolutePath);
  return {
    path: `/${filename}`,
    contentBase64: content.toString('base64'),
    sha256: createHash('sha256').update(content).digest('hex'),
  };
});

const firmwarePackage = {
  version: firmwareVersion,
  files,
};

mkdirSync(distDir, { recursive: true });
const serialized = `${JSON.stringify(firmwarePackage, null, 2)}\n`;
writeFileSync(outputJsonPath, serialized, 'utf8');

const outputSha256 = createHash('sha256').update(serialized).digest('hex');
process.stdout.write(
  `${JSON.stringify(
    {
      firmwareVersion,
      sourceDir,
      outputJsonPath,
      outputSha256,
      files: files.map((entry) => entry.path),
    },
    null,
    2,
  )}\n`,
);
