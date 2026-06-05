import { createHash, randomBytes } from 'node:crypto';

const DOWNLOAD_TOKEN_BYTE_LENGTH = 32;

export type DownloadTokenPurpose = 'email' | 'checkout_return';

export const createDownloadToken = () =>
  randomBytes(DOWNLOAD_TOKEN_BYTE_LENGTH).toString('base64url');

export const hashDownloadToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');
