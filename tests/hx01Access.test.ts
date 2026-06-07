import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHx01AccessToken,
  verifyHx01AccessToken,
  verifyHx01Pin,
} from '../src/lib/hx01Access.ts';
import { checkRateLimit, resetRateLimitForTest } from '../src/lib/rateLimit.ts';

const withEnv = (env: Record<string, string | undefined>, callback: () => void) => {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }

  try {
    callback();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
};

test('HX01 access fails closed in production without configured secrets', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      HX01_ACCESS_PIN: undefined,
      HX01_ACCESS_COOKIE_SECRET: undefined,
    },
    () => {
      assert.equal(verifyHx01Pin('4206'), false);
      assert.equal(verifyHx01AccessToken('hx01-access-granted.signature'), false);
      assert.throws(() => createHx01AccessToken(), /HX01_ACCESS_COOKIE_SECRET/);
    },
  );
});

test('HX01 access accepts configured production PIN and signed cookie', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      HX01_ACCESS_PIN: '123456',
      HX01_ACCESS_COOKIE_SECRET: 'super-secret-cookie-key',
    },
    () => {
      assert.equal(verifyHx01Pin('123456'), true);
      assert.equal(verifyHx01Pin('4206'), false);
      assert.equal(verifyHx01AccessToken(createHx01AccessToken()), true);
    },
  );
});

test('rate limiter locks out requests after the configured window limit', () => {
  const key = 'test:hx01-rate-limit';
  resetRateLimitForTest(key);

  assert.equal(checkRateLimit({ key, limit: 2, windowMs: 1000, now: 100 }).limited, false);
  assert.equal(checkRateLimit({ key, limit: 2, windowMs: 1000, now: 200 }).limited, false);
  assert.equal(checkRateLimit({ key, limit: 2, windowMs: 1000, now: 300 }).limited, true);
  assert.equal(checkRateLimit({ key, limit: 2, windowMs: 1000, now: 1200 }).limited, false);
});
