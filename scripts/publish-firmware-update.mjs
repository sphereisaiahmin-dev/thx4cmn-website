import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const workspaceRoot = resolve(process.cwd());
const manifestKey = 'updates/firmware-manifest.json';
const DIRECT_ARTIFACT_NAME_PATTERN = /firmware-([0-9]+\.[0-9]+\.[0-9]+)-direct\.json$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

const parseEnvFile = (filePath) => {
  const env = {};
  if (!existsSync(filePath)) {
    return env;
  }

  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && !(key in env)) {
      env[key] = value;
    }
  }

  return env;
};

const readConfigValue = (key, fallbackEnv) => process.env[key] ?? fallbackEnv[key] ?? '';

const parseSemver = (version) => {
  const match = version.replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
};

const computeReleaseRank = (version) => {
  const parsed = parseSemver(version);
  if (!parsed) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  if (parsed.major === 0) {
    return 50000 + parsed.minor * 100 + parsed.patch;
  }
  return parsed.major * 10000 + parsed.minor * 100 + parsed.patch;
};

const streamToString = async (stream) => {
  if (!stream) {
    return '';
  }

  if (typeof stream.transformToString === 'function') {
    return stream.transformToString();
  }

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const getCurrentFirmwareVersion = () => {
  const source = readFileSync(resolve(workspaceRoot, 'thxcmididevicecode/code.py'), 'utf8');
  const match = source.match(/FIRMWARE_VERSION\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error('Unable to infer firmware version from thxcmididevicecode/code.py.');
  }
  return match[1];
};

const parseArtifactArgs = () => {
  const argv = process.argv.slice(2);
  const artifactArgIndex = argv.indexOf('--artifact');
  const defaultVersion = getCurrentFirmwareVersion();
  const defaultArtifact = `dist/thx-c-firmware-${defaultVersion}-direct.json`;

  return resolve(
    workspaceRoot,
    artifactArgIndex >= 0 && argv[artifactArgIndex + 1] ? argv[artifactArgIndex + 1] : defaultArtifact,
  );
};

const toHexSha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const validateFirmwarePackage = (candidate, expectedVersion) => {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    throw new Error('Firmware package must be an object.');
  }

  if (candidate.version !== expectedVersion) {
    throw new Error(
      `Firmware package version mismatch: expected ${expectedVersion}, received ${String(candidate.version)}.`,
    );
  }

  if (!Array.isArray(candidate.files) || candidate.files.length === 0) {
    throw new Error('Firmware package files must be a non-empty array.');
  }

  const seenPaths = new Set();
  for (const [index, file] of candidate.files.entries()) {
    if (typeof file !== 'object' || file === null || Array.isArray(file)) {
      throw new Error(`Firmware package file entry ${index} must be an object.`);
    }

    const { path, contentBase64, sha256 } = file;
    if (typeof path !== 'string' || !path.startsWith('/') || path.includes('..')) {
      throw new Error(`Firmware package file entry ${index} has invalid path.`);
    }

    if (seenPaths.has(path)) {
      throw new Error(`Firmware package contains duplicate path ${path}.`);
    }
    seenPaths.add(path);

    if (typeof contentBase64 !== 'string' || contentBase64.length === 0) {
      throw new Error(`Firmware package file ${path} contentBase64 is invalid.`);
    }

    if (typeof sha256 !== 'string' || !SHA256_HEX_PATTERN.test(sha256.toLowerCase())) {
      throw new Error(`Firmware package file ${path} sha256 is invalid.`);
    }

    const decoded = Buffer.from(contentBase64, 'base64');
    if (decoded.length === 0) {
      throw new Error(`Firmware package file ${path} decoded content is empty.`);
    }

    const digest = toHexSha256(decoded);
    if (digest !== sha256.toLowerCase()) {
      throw new Error(`Firmware package file ${path} sha256 mismatch.`);
    }
  }
};

const artifactPath = parseArtifactArgs();
const artifactBuffer = readFileSync(artifactPath);
const artifactName = basename(artifactPath);
const versionMatch = artifactName.match(DIRECT_ARTIFACT_NAME_PATTERN);
if (!versionMatch) {
  throw new Error(
    `Could not infer firmware version from artifact filename ${artifactName}. Expected *-x.y.z-direct.json.`,
  );
}

const firmwareVersion = versionMatch[1];
const releaseRank = computeReleaseRank(firmwareVersion);
const sha256 = toHexSha256(artifactBuffer);
const artifactKey = `updates/${artifactName}`;

const artifactPayload = JSON.parse(artifactBuffer.toString('utf8'));
validateFirmwarePackage(artifactPayload, firmwareVersion);

const fallbackEnv = {
  ...parseEnvFile(resolve(workspaceRoot, '.env.local')),
  ...parseEnvFile(resolve(workspaceRoot, '.env.example')),
};

const endpoint = readConfigValue('R2_ENDPOINT', fallbackEnv);
const accessKeyId = readConfigValue('R2_ACCESS_KEY_ID', fallbackEnv);
const secretAccessKey = readConfigValue('R2_SECRET_ACCESS_KEY', fallbackEnv);
const bucket = readConfigValue('R2_BUCKET', fallbackEnv);

if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
  throw new Error('Missing R2 configuration. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.');
}

const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

let existingManifest = null;
try {
  const existingResponse = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: manifestKey,
    }),
  );
  const text = await streamToString(existingResponse.Body);
  existingManifest = JSON.parse(text);
} catch {
  existingManifest = null;
}

const releases = Array.isArray(existingManifest?.releases) ? [...existingManifest.releases] : [];
const nextRelease = {
  version: firmwareVersion,
  releaseRank,
  packageKey: artifactKey,
  sha256,
  strategy: 'direct_flash',
  notes: `Direct serial firmware package ${firmwareVersion}.`,
};

const filteredReleases = releases.filter((release) => {
  if (!release || typeof release !== 'object') {
    return false;
  }
  if (release.version === firmwareVersion) {
    return false;
  }
  if (release.strategy === 'manual_bridge') {
    return false;
  }
  return true;
});

filteredReleases.push(nextRelease);
filteredReleases.sort((a, b) => (b.releaseRank ?? 0) - (a.releaseRank ?? 0));

const latestRelease = filteredReleases[0];
const manifest = {
  device: 'thx-c',
  generatedAt: new Date().toISOString(),
  latestVersion: latestRelease.version,
  latestReleaseRank: latestRelease.releaseRank,
  releases: filteredReleases,
};

await client.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: artifactKey,
    Body: artifactBuffer,
    ContentType: 'application/json',
    CacheControl: 'no-cache',
  }),
);

await client.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: manifestKey,
    Body: JSON.stringify(manifest, null, 2),
    ContentType: 'application/json',
    CacheControl: 'no-cache',
  }),
);

const artifactHead = await client.send(
  new HeadObjectCommand({
    Bucket: bucket,
    Key: artifactKey,
  }),
);
const manifestHead = await client.send(
  new HeadObjectCommand({
    Bucket: bucket,
    Key: manifestKey,
  }),
);

const listResponse = await client.send(
  new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: 'updates/',
  }),
);

const signedUrl = await getSignedUrl(
  client,
  new GetObjectCommand({
    Bucket: bucket,
    Key: artifactKey,
  }),
  { expiresIn: 120 },
);

process.stdout.write(
  `${JSON.stringify(
    {
      bucket,
      artifactPath,
      artifactKey,
      artifactSize: artifactHead.ContentLength ?? artifactBuffer.byteLength,
      manifestKey,
      manifestSize: manifestHead.ContentLength ?? undefined,
      firmwareVersion,
      releaseRank,
      sha256,
      updatesKeys: (listResponse.Contents ?? []).map((entry) => entry.Key).filter(Boolean),
      signedUrl,
    },
    null,
    2,
  )}\n`,
);
