type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const storeOwner = globalThis as typeof globalThis & {
  __thx4cmnRateLimits?: Map<string, RateLimitBucket>;
};

const buckets = storeOwner.__thx4cmnRateLimits ?? new Map<string, RateLimitBucket>();
storeOwner.__thx4cmnRateLimits = buckets;

export const getClientIp = (request: Request) => {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  return (
    forwardedFor ||
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('cf-connecting-ip')?.trim() ||
    'unknown'
  );
};

export const checkRateLimit = ({
  key,
  limit,
  windowMs,
  now = Date.now(),
}: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}) => {
  const existing = buckets.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + windowMs,
        };

  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    limited: bucket.count > limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
};

export const resetRateLimitForTest = (key?: string) => {
  if (key) {
    buckets.delete(key);
    return;
  }

  buckets.clear();
};
