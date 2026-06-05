import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeCheckoutQuantity,
  parseCheckoutItemsPayload,
  toCheckoutItemsPayload,
} from '../src/lib/checkout.ts';
import {
  CART_TTL_MS,
  isPersistedCartExpired,
  normalizePersistedCartItems,
} from '../src/lib/cartPersistence.ts';
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
        purchaseStatus: 'available',
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
        purchaseStatus: 'available',
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
        purchaseStatus: 'available',
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

test('persisted cart ttl accepts fresh state and expires stale state', () => {
  const now = 1_800_000_000_000;

  assert.equal(isPersistedCartExpired(now - CART_TTL_MS + 1, now), false);
  assert.equal(isPersistedCartExpired(now - CART_TTL_MS - 1, now), true);
  assert.equal(isPersistedCartExpired(undefined, now), true);
});

test('persisted cart items hydrate from current product data', () => {
  const items = normalizePersistedCartItems([
    {
      productId: 'sample-pack',
      name: 'Old name',
      priceCents: 999,
      currency: 'EUR',
      quantity: 2.8,
      type: 'digital',
    },
  ], () => ({
    name: 'Community Vol. 1',
    priceCents: 0,
    currency: 'USD',
    type: 'digital',
    purchaseStatus: 'available',
  }));

  assert.deepEqual(items, [
    {
      productId: 'sample-pack',
      name: 'Community Vol. 1',
      priceCents: 0,
      currency: 'USD',
      quantity: 2,
      type: 'digital',
    },
  ]);
});

test('persisted cart drops current products that are no longer purchasable', () => {
  const items = normalizePersistedCartItems([
    {
      productId: 'universe-vol-1',
      name: 'Universe Vol. 1',
      priceCents: 3000,
      currency: 'USD',
      quantity: 1,
      type: 'digital',
    },
  ], () => ({
    name: 'Universe Vol. 1',
    priceCents: 3000,
    currency: 'USD',
    type: 'digital',
    purchaseStatus: 'coming-soon',
  }));

  assert.deepEqual(items, []);
});
