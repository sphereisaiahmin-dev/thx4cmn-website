import { createHash, createHmac, randomBytes } from 'node:crypto';

const DOWNLOAD_TOKEN_BYTE_LENGTH = 32;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const EMAIL_DOWNLOAD_TOKEN_TTL_MS = 30 * DAY_MS;
export const CHECKOUT_RETURN_DOWNLOAD_TOKEN_TTL_MS = 30 * MINUTE_MS;
export const EMAIL_DOWNLOAD_MAX_DOWNLOADS = 10;
export const CHECKOUT_RETURN_DOWNLOAD_MAX_DOWNLOADS = 3;

export type DownloadTokenPurpose = 'email' | 'checkout_return';

export const createDownloadToken = () =>
  randomBytes(DOWNLOAD_TOKEN_BYTE_LENGTH).toString('base64url');

export const hashDownloadToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const deriveCheckoutReturnDownloadToken = (
  returnToken: string,
  entitlementId: string,
) =>
  createHmac('sha256', returnToken)
    .update(`checkout_return:${entitlementId}`, 'utf8')
    .digest('base64url');

export const downloadTokenExpiresAt = (ttlMs: number, now = new Date()) =>
  new Date(now.getTime() + ttlMs).toISOString();

export const isDownloadTokenExpired = (
  expiresAt: string | null | undefined,
  now = new Date(),
) => (expiresAt ? new Date(expiresAt).getTime() <= now.getTime() : false);

export const hasDownloadTokenReachedLimit = (
  downloadCount: number | null | undefined,
  maxDownloads: number | null | undefined,
) => typeof maxDownloads === 'number' && maxDownloads >= 0 && (downloadCount ?? 0) >= maxDownloads;
