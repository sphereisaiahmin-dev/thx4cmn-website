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
