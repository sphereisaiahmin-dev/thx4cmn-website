import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeCheckoutQuantity,
  parseCheckoutItemsPayload,
  toCheckoutItemsPayload,
} from '../src/lib/checkout.ts';
import {
  buildStripeCheckoutLineItems,
  shouldUseStripeCheckout,
} from '../src/lib/stripeCheckout.ts';

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

test('Stripe line items include zero-price products that have a Stripe price', () => {
  const lineItems = buildStripeCheckoutLineItems([
    {
      item: { productId: 'sample-pack', quantity: 1 },
      product: {
        id: 'sample-pack',
        slug: 'sample-pack',
        name: 'Community Vol. 1',
        description: 'Free pack',
        type: 'digital',
        isReleased: true,
        priceCents: 0,
        currency: 'USD',
        stripePriceId: 'price_free_community',
        r2Key: null,
        deliveryMethod: 'email',
      },
    },
  ]);

  assert.equal(shouldUseStripeCheckout([
    {
      item: { productId: 'sample-pack', quantity: 1 },
      product: {
        id: 'sample-pack',
        slug: 'sample-pack',
        name: 'Community Vol. 1',
        description: 'Free pack',
        type: 'digital',
        isReleased: true,
        priceCents: 0,
        currency: 'USD',
        stripePriceId: 'price_free_community',
        r2Key: null,
        deliveryMethod: 'email',
      },
    },
  ]), true);
  assert.deepEqual(lineItems, [{ price: 'price_free_community', quantity: 1 }]);
});

test('free products without Stripe prices stay on the direct claim fallback', () => {
  const products = [
    {
      item: { productId: 'legacy-free-pack', quantity: 1 },
      product: {
        id: 'legacy-free-pack',
        slug: 'legacy-free-pack',
        name: 'Legacy Free Pack',
        description: 'Free pack',
        type: 'digital',
        isReleased: true,
        priceCents: 0,
        currency: 'USD',
        r2Key: null,
        deliveryMethod: 'email',
      },
    },
  ] as const;

  assert.equal(shouldUseStripeCheckout(products), false);
  assert.deepEqual(buildStripeCheckoutLineItems(products), []);
});
