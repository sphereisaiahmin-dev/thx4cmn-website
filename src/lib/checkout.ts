export const MIN_CHECKOUT_QUANTITY = 1;

export interface CheckoutItem {
  productId: string;
  quantity: number;
}

type ParseCheckoutItemsResult =
  | { ok: true; items: CheckoutItem[] }
  | { ok: false; error: string };

const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);

export const isValidCheckoutQuantity = (candidate: unknown): candidate is number =>
  typeof candidate === 'number' &&
  Number.isFinite(candidate) &&
  Number.isInteger(candidate) &&
  candidate >= MIN_CHECKOUT_QUANTITY;

export const normalizeCheckoutQuantity = (candidate: unknown, fallback = MIN_CHECKOUT_QUANTITY) => {
  const safeFallback = isValidCheckoutQuantity(fallback)
    ? fallback
    : MIN_CHECKOUT_QUANTITY;
  const numeric = typeof candidate === 'number' ? candidate : Number(candidate);
  if (!Number.isFinite(numeric)) {
    return safeFallback;
  }

  return Math.max(MIN_CHECKOUT_QUANTITY, Math.floor(numeric));
};

export const toCheckoutItemsPayload = (
  items: ReadonlyArray<{ productId: string; quantity: number }>,
) =>
  items
    .filter((item) => typeof item.productId === 'string' && item.productId.trim().length > 0)
    .map((item) => ({
      productId: item.productId,
      quantity: normalizeCheckoutQuantity(item.quantity),
    }));

export const parseCheckoutItemsPayload = (candidate: unknown): ParseCheckoutItemsResult => {
  if (!isRecord(candidate)) {
    return { ok: false, error: 'Malformed checkout payload.' };
  }

  if (!Array.isArray(candidate.items) || candidate.items.length === 0) {
    return { ok: false, error: 'No items provided.' };
  }

  const parsed: CheckoutItem[] = [];

  for (const [index, entry] of candidate.items.entries()) {
    if (!isRecord(entry)) {
      return {
        ok: false,
        error: `Item ${index + 1} is malformed.`,
      };
    }

    const productId = typeof entry.productId === 'string' ? entry.productId.trim() : '';
    if (!productId) {
      return {
        ok: false,
        error: `Item ${index + 1} is missing a valid productId.`,
      };
    }

    if (!isValidCheckoutQuantity(entry.quantity)) {
      return {
        ok: false,
        error: 'All items must include an integer quantity of at least 1.',
      };
    }

    parsed.push({
      productId,
      quantity: entry.quantity,
    });
  }

  return { ok: true, items: parsed };
};
