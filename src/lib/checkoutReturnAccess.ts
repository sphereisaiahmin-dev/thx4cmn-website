import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const RETURN_TOKEN_BYTE_LENGTH = 32;
const MINUTE_MS = 60 * 1000;

export const CHECKOUT_RETURN_TOKEN_TTL_MS = 30 * MINUTE_MS;

export const createCheckoutReturnToken = () =>
  randomBytes(RETURN_TOKEN_BYTE_LENGTH).toString('base64url');

export const hashCheckoutReturnToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const checkoutReturnTokenExpiresAt = (now = new Date()) =>
  new Date(now.getTime() + CHECKOUT_RETURN_TOKEN_TTL_MS).toISOString();

export const createCheckoutReturnMetadata = (
  token: string,
  now = new Date(),
) => ({
  return_token_hash: hashCheckoutReturnToken(token),
  return_token_expires_at: checkoutReturnTokenExpiresAt(now),
});

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const verifyCheckoutReturnToken = ({
  token,
  metadata,
  now = new Date(),
}: {
  token: string | null | undefined;
  metadata: Record<string, string> | null | undefined;
  now?: Date;
}) => {
  if (!token) {
    return { ok: false, error: 'Missing checkout return token.', status: 400 } as const;
  }

  const expectedHash = metadata?.return_token_hash;
  const expiresAt = metadata?.return_token_expires_at;
  if (!expectedHash || !expiresAt) {
    return { ok: false, error: 'Checkout return token metadata is missing.', status: 403 } as const;
  }

  if (new Date(expiresAt).getTime() <= now.getTime()) {
    return { ok: false, error: 'Checkout return token has expired.', status: 403 } as const;
  }

  const actualHash = hashCheckoutReturnToken(token);
  if (!safeEqual(actualHash, expectedHash)) {
    return { ok: false, error: 'Checkout return token is invalid.', status: 403 } as const;
  }

  return { ok: true, expiresAt } as const;
};
