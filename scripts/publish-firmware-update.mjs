import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

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

const argv = process.argv.slice(2);
const artifactArgIndex = argv.indexOf('--artifact');
const artifactPath = resolve(
  workspaceRoot,
  artifactArgIndex >= 0 && argv[artifactArgIndex + 1]
    ? argv[artifactArgIndex + 1]
    : 'dist/thx-c-firmware-0.9.0-bridge.zip',
);

const artifactBuffer = readFileSync(artifactPath);
const artifactName = basename(artifactPath);
const versionMatch = artifactName.match(/firmware-([0-9]+\.[0-9]+\.[0-9]+)-bridge\.zip$/);
if (!versionMatch) {
  throw new Error(
    `Could not infer firmware version from artifact filename ${artifactName}. Expected *-x.y.z-bridge.zip.`,
  );
}

const firmwareVersion = versionMatch[1];
const releaseRank = computeReleaseRank(firmwareVersion);
const sha256 = createHash('sha256').update(artifactBuffer).digest('hex');
const artifactKey = `updates/${artifactName}`;

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
  strategy: 'manual_bridge',
  bridgeFromVersionPrefixes: ['2.4.'],
  notes: `Bridge package for 2.4.x -> ${firmwareVersion}.`,
};

const filteredReleases = releases.filter((release) => release?.version !== firmwareVersion);
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
    ContentType: 'application/zip',
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
