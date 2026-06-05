import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAppOrigin } from '../src/lib/appOrigin.ts';
import { createDownloadToken, hashDownloadToken } from '../src/lib/downloadTokens.ts';
import { buildDigitalFulfillmentEmail } from '../src/lib/fulfillmentEmail.ts';

test('download tokens are URL-safe and hash deterministically', () => {
  const token = createDownloadToken();

  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(hashDownloadToken(token), hashDownloadToken(token));
  assert.notEqual(hashDownloadToken(token), token);
});

test('fulfillment email includes the product download link', () => {
  const email = buildDigitalFulfillmentEmail({
    orderId: 'c2a23a48-2fb0-40e7-bf21-0897b26dcabd',
    replyToEmail: 'support@example.com',
    items: [
      {
        productName: 'Community Vol. 1',
        downloadUrl: 'https://example.com/api/download?token=abc123',
      },
    ],
  });

  assert.equal(email.subject, 'Your Community Vol. 1 download');
  assert.match(email.html, /Community Vol\. 1/);
  assert.match(email.html, /https:\/\/example\.com\/api\/download\?token=abc123/);
  assert.match(email.text, /support@example\.com/);
});

test('fulfillment email escapes product names in HTML', () => {
  const email = buildDigitalFulfillmentEmail({
    orderId: 'c2a23a48-2fb0-40e7-bf21-0897b26dcabd',
    items: [
      {
        productName: '<Pack & Mix>',
        downloadUrl: 'https://example.com/api/download?token=abc123',
      },
    ],
  });

  assert.match(email.html, /&lt;Pack &amp; Mix&gt;/);
  assert.doesNotMatch(email.html, /<Pack & Mix>/);
});

test('development app origin ignores placeholder env and uses request host', () => {
  const previousAppOrigin = process.env.APP_ORIGIN;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.APP_ORIGIN = 'https://your-domain.example';
  process.env.NODE_ENV = 'development';

  try {
    assert.equal(
      resolveAppOrigin(new Headers({ host: 'localhost:3001' })),
      'http://localhost:3001',
    );
  } finally {
    if (previousAppOrigin === undefined) {
      delete process.env.APP_ORIGIN;
    } else {
      process.env.APP_ORIGIN = previousAppOrigin;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});
