import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const getR2Client = () => {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing Cloudflare R2 environment variables.');
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
};

const streamToString = async (stream: unknown) => {
  if (!stream) {
    return '';
  }

  if (typeof (stream as { transformToString?: () => Promise<string> }).transformToString === 'function') {
    return (stream as { transformToString: () => Promise<string> }).transformToString();
  }

  if (typeof (stream as { getReader?: () => ReadableStreamDefaultReader<Uint8Array> }).getReader === 'function') {
    const reader = (
      stream as { getReader: () => ReadableStreamDefaultReader<Uint8Array> }
    ).getReader();
    const decoder = new TextDecoder();
    let output = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        output += decoder.decode(value, { stream: true });
      }
    }

    output += decoder.decode();
    return output;
  }

  if (
    typeof Buffer !== 'undefined' &&
    (stream as { [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array> })[Symbol.asyncIterator]
  ) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf-8');
  }

  throw new Error('Unable to read R2 object body.');
};

export const getSignedDownloadUrl = async (key: string, expiresInSeconds = 60) => {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error('Missing R2_BUCKET environment variable.');
  }

  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
};

export const getR2ObjectText = async (key: string) => {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error('Missing R2_BUCKET environment variable.');
  }

  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await client.send(command);
  return streamToString(response.Body);
};

export const listR2Objects = async (prefix: string) => {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error('Missing R2_BUCKET environment variable.');
  }

  const client = getR2Client();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    response.Contents?.forEach((item) => {
      if (item.Key) {
        keys.push(item.Key);
      }
    });

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
};
