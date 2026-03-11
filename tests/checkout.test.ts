import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeCheckoutQuantity,
  parseCheckoutItemsPayload,
  toCheckoutItemsPayload,
} from '../src/lib/checkout.ts';

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
