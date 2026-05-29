import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeCheckoutQuantity,
  parseCheckoutItemsPayload,
  toCheckoutItemsPayload,
} from '../src/lib/checkout.ts';
import { buildStripeCheckoutLineItem } from '../src/lib/checkoutPricing.ts';
import { formatCurrency, formatProductPrice } from '../src/lib/format.ts';

test('normalizeCheckoutQuantity floors and clamps to minimum', () => {
  assert.equal(normalizeCheckoutQuantity(3.9), 3);
  assert.equal(normalizeCheckoutQuantity(0), 1);
  assert.equal(normalizeCheckoutQuantity(-8), 1);
  assert.equal(normalizeCheckoutQuantity(Number.NaN), 1);
});

test('toCheckoutItemsPayload normalizes outgoing quantities', () => {
  const payload = toCheckoutItemsPayload([
    { productId: 'sample-pack', quantity: 2.9 },
    { productId: 'midi-device', quantity: 0 },
  ]);

  assert.deepEqual(payload, [
    { productId: 'sample-pack', quantity: 2 },
    { productId: 'midi-device', quantity: 1 },
  ]);
});

test('parseCheckoutItemsPayload accepts strict integer quantities', () => {
  const parsed = parseCheckoutItemsPayload({
    items: [
      { productId: 'sample-pack', quantity: 1 },
      { productId: 'midi-device', quantity: 3 },
    ],
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.items, [
      { productId: 'sample-pack', quantity: 1 },
      { productId: 'midi-device', quantity: 3 },
    ]);
  }
});

test('parseCheckoutItemsPayload rejects fractional quantities', () => {
  const parsed = parseCheckoutItemsPayload({
    items: [{ productId: 'sample-pack', quantity: 1.5 }],
  });

  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.error, /integer quantity/i);
  }
});

test('parseCheckoutItemsPayload rejects malformed items', () => {
  const parsed = parseCheckoutItemsPayload({ items: [{}] });

  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.error, /productid/i);
  }
});

test('buildStripeCheckoutLineItem uses inline zero-cost price data for free products', () => {
  const lineItem = buildStripeCheckoutLineItem(
    {
      id: 'sample-pack',
      slug: 'sample-pack',
      name: 'Community Vol. 1',
      description: 'Free community sounds.',
      type: 'digital',
      isReleased: true,
      priceCents: 0,
      currency: 'USD',
      stripePriceId: 'price_should_be_ignored',
      r2Key: 'sample-packs/thx4cmn-vol-1.zip',
    },
    1,
  );

  assert.deepEqual(lineItem, {
    price_data: {
      currency: 'USD',
      product_data: {
        name: 'Community Vol. 1',
        description: 'Free community sounds.',
      },
      unit_amount: 0,
    },
    quantity: 1,
  });
});

test('buildStripeCheckoutLineItem preserves Stripe price ids for paid products', () => {
  const lineItem = buildStripeCheckoutLineItem(
    {
      id: 'midi-device',
      slug: 'midi-chord-device',
      name: 'hx01',
      description: 'Hardware device.',
      type: 'physical',
      isReleased: true,
      priceCents: 14900,
      currency: 'USD',
      stripePriceId: 'price_paid',
    },
    2,
  );

  assert.deepEqual(lineItem, {
    price: 'price_paid',
    quantity: 2,
  });
});

test('formatProductPrice displays free labels without changing numeric totals', () => {
  assert.equal(formatProductPrice(0, 'USD'), 'Free');
  assert.equal(formatProductPrice(2500, 'USD'), '$25.00');
  assert.equal(formatCurrency(0, 'USD'), '$0.00');
});
