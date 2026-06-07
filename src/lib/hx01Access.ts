import { createHmac, timingSafeEqual } from 'node:crypto';

export const HX01_ACCESS_COOKIE_NAME = 'thx4cmn:hx01-access';
export const HX01_ACCESS_COOKIE_MAX_AGE_SECONDS = 60;

const ACCESS_PAYLOAD = 'hx01-access-granted';
const DEFAULT_HX01_PIN = '4206';
const LOCAL_ACCESS_SECRET = 'thx4cmn-local-hx01-access-secret';

const isProduction = () => process.env.NODE_ENV === 'production';

const getAccessSecret = () => {
  const configuredSecret = process.env.HX01_ACCESS_COOKIE_SECRET?.trim();
  if (configuredSecret) return configuredSecret;

  if (isProduction()) {
    throw new Error('HX01_ACCESS_COOKIE_SECRET is required in production.');
  }

  return LOCAL_ACCESS_SECRET;
};

const getConfiguredPin = () => {
  const configuredPin = process.env.HX01_ACCESS_PIN?.trim();
  if (configuredPin) return configuredPin;

  return isProduction() ? null : DEFAULT_HX01_PIN;
};

const signPayload = (payload: string) =>
  createHmac('sha256', getAccessSecret()).update(payload).digest('base64url');

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const createHx01AccessToken = () => `${ACCESS_PAYLOAD}.${signPayload(ACCESS_PAYLOAD)}`;

export const verifyHx01AccessToken = (token: string | undefined) => {
  if (!token) return false;
  const [payload, signature, ...rest] = token.split('.');
  if (rest.length > 0 || payload !== ACCESS_PAYLOAD || !signature) return false;
  try {
    return safeEqual(signature, signPayload(payload));
  } catch {
    return false;
  }
};

export const verifyHx01Pin = (candidate: unknown) => {
  if (typeof candidate !== 'string') return false;
  const configuredPin = getConfiguredPin();
  if (!configuredPin) return false;
  return safeEqual(candidate.trim(), configuredPin);
};
