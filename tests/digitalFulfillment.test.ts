import assert from 'node:assert/strict';
import test from 'node:test';

import { getProductById } from '../src/data/products.ts';
import { resolveAppOrigin } from '../src/lib/appOrigin.ts';
import {
  CHECKOUT_RETURN_DOWNLOAD_MAX_DOWNLOADS,
  createDownloadToken,
  deriveCheckoutReturnDownloadToken,
  hasDownloadTokenReachedLimit,
  hashDownloadToken,
  isDownloadTokenExpired,
} from '../src/lib/downloadTokens.ts';
import {
  createCheckoutReturnMetadata,
  createCheckoutReturnToken,
  verifyCheckoutReturnToken,
} from '../src/lib/checkoutReturnAccess.ts';
import { readEmailLogoAttachment } from '../src/lib/emailLogoAttachment.ts';
import { buildDigitalFulfillmentEmail } from '../src/lib/fulfillmentEmail.ts';

test('download tokens are URL-safe and hash deterministically', () => {
  const token = createDownloadToken();

  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(hashDownloadToken(token), hashDownloadToken(token));
  assert.notEqual(hashDownloadToken(token), token);
});

test('checkout return access token validates hash and expiry metadata', () => {
  const now = new Date('2026-06-07T12:00:00.000Z');
  const token = createCheckoutReturnToken();
  const metadata = createCheckoutReturnMetadata(token, now);

  assert.equal(
    verifyCheckoutReturnToken({
      token,
      metadata,
      now: new Date('2026-06-07T12:10:00.000Z'),
    }).ok,
    true,
  );

  assert.equal(
    verifyCheckoutReturnToken({
      token: 'wrong-token',
      metadata,
      now: new Date('2026-06-07T12:10:00.000Z'),
    }).ok,
    false,
  );

  assert.equal(
    verifyCheckoutReturnToken({
      token,
      metadata,
      now: new Date('2026-06-07T12:31:00.000Z'),
    }).ok,
    false,
  );
});

test('checkout return download tokens are deterministic per entitlement', () => {
  const token = 'return-token';
  const entitlementId = 'entitlement-a';

  assert.equal(
    deriveCheckoutReturnDownloadToken(token, entitlementId),
    deriveCheckoutReturnDownloadToken(token, entitlementId),
  );
  assert.notEqual(
    deriveCheckoutReturnDownloadToken(token, entitlementId),
    deriveCheckoutReturnDownloadToken(token, 'entitlement-b'),
  );
});

test('download token expiry and max-download helpers enforce limits', () => {
  const now = new Date('2026-06-07T12:00:00.000Z');

  assert.equal(isDownloadTokenExpired('2026-06-07T11:59:59.999Z', now), true);
  assert.equal(isDownloadTokenExpired('2026-06-07T12:00:00.001Z', now), false);
  assert.equal(hasDownloadTokenReachedLimit(2, CHECKOUT_RETURN_DOWNLOAD_MAX_DOWNLOADS), false);
  assert.equal(hasDownloadTokenReachedLimit(3, CHECKOUT_RETURN_DOWNLOAD_MAX_DOWNLOADS), true);
  assert.equal(hasDownloadTokenReachedLimit(99, null), false);
});

test('fulfillment email includes the product download link', () => {
  const email = buildDigitalFulfillmentEmail({
    orderId: 'c2a23a48-2fb0-40e7-bf21-0897b26dcabd',
    replyToEmail: 'support@example.com',
    customerEmail: 'buyer@example.com',
    paymentStatus: 'paid',
    amountTotalCents: 3000,
    currency: 'USD',
    receiptItems: [
      {
        productName: 'Community Vol. 1',
        quantity: 1,
        unitAmountCents: 3000,
      },
    ],
    items: [
      {
        productName: 'Community Vol. 1',
        downloadUrl: 'https://example.com/api/download?token=abc123',
      },
    ],
    logoSrc: 'cid:thx4cmn-email-logo',
  });

  assert.equal(email.subject, 'Your Community Vol. 1 download');
  assert.match(email.html, /Receipt/);
  assert.match(email.html, /C2A23A48/);
  assert.match(email.html, /Paid/);
  assert.match(email.html, /\$30\.00/);
  assert.match(email.html, /buyer@example\.com/);
  assert.match(email.html, /Community Vol\. 1/);
  assert.match(email.html, /https:\/\/example\.com\/api\/download\?token=abc123/);
  assert.match(email.html, /cid:thx4cmn-email-logo/);
  assert.match(email.html, /alt="thx4cmn"/);
  assert.ok(
    email.html.indexOf('cid:thx4cmn-email-logo') < email.html.indexOf('Questions? Reply'),
    'email logo should appear above the support reply line',
  );
  assert.doesNotMatch(email.html, /3d\/samplepack/i);
  assert.doesNotMatch(email.text, /3D model asset/i);
  assert.doesNotMatch(email.text, /thx4cmn-logo\.png/);
  assert.match(email.text, /Order: C2A23A48/);
  assert.match(email.text, /Status: Paid/);
  assert.match(email.text, /Total: \$30\.00/);
  assert.match(email.text, /support@example\.com/);
});

test('fulfillment email escapes product names in HTML', () => {
  const email = buildDigitalFulfillmentEmail({
    orderId: 'c2a23a48-2fb0-40e7-bf21-0897b26dcabd',
    customerEmail: 'buyer<&>@example.com',
    receiptItems: [
      {
        productName: '<Pack & Mix>',
        quantity: 1,
        unitAmountCents: 0,
      },
    ],
    items: [
      {
        productName: '<Pack & Mix>',
        downloadUrl: 'https://example.com/api/download?token=abc123',
      },
    ],
  });

  assert.match(email.html, /&lt;Pack &amp; Mix&gt;/);
  assert.match(email.html, /buyer&lt;&amp;&gt;@example.com/);
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

test('released digital products point to distinct verified R2 pack objects', () => {
  const community = getProductById('sample-pack');
  const universe = getProductById('universe-vol-1');

  assert.equal(community?.r2Key, 'packs/Community Vol. 1.zip');
  assert.equal(universe?.r2Key, 'packs/Universe Vol. 1.zip');
  assert.notEqual(community?.r2Key, universe?.r2Key);
});

test('email logo attachment is encoded for inline CID embedding', () => {
  const attachment = readEmailLogoAttachment();

  assert.equal(attachment.filename, 'thx4cmn-logo.png');
  assert.equal(attachment.content_type, 'image/png');
  assert.equal(attachment.content_id, 'thx4cmn-email-logo');
  assert.match(attachment.content, /^[A-Za-z0-9+/]+={0,2}$/);
});
