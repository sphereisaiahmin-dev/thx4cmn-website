import { createHmac, timingSafeEqual } from 'node:crypto';

export const HX01_ACCESS_COOKIE_NAME = 'thx4cmn:hx01-access';
export const HX01_ACCESS_COOKIE_MAX_AGE_SECONDS = 60;

const ACCESS_PAYLOAD = 'hx01-access-granted';
const DEFAULT_HX01_PIN = '4206';

const getAccessSecret = () =>
  process.env.HX01_ACCESS_COOKIE_SECRET?.trim() ||
  process.env.NEXTAUTH_SECRET?.trim() ||
  process.env.STRIPE_SECRET_KEY?.trim() ||
  'thx4cmn-local-hx01-access-secret';

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
  return safeEqual(signature, signPayload(payload));
};

export const verifyHx01Pin = (candidate: unknown) => {
  if (typeof candidate !== 'string') return false;
  const configuredPin = process.env.HX01_ACCESS_PIN?.trim() || DEFAULT_HX01_PIN;
  return safeEqual(candidate.trim(), configuredPin);
};
