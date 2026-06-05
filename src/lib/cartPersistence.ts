type ProductType = 'digital' | 'physical';
type ProductPurchaseStatus = 'available' | 'coming-soon';

export interface PersistedCartItem {
  productId: string;
  name: string;
  priceCents: number;
  currency: string;
  quantity: number;
  type: ProductType;
}

interface ProductSnapshot {
  name: string;
  priceCents: number;
  currency: string;
  type: ProductType;
  purchaseStatus?: ProductPurchaseStatus;
}

export const CART_TTL_MS = 60 * 60 * 1000;

export const isPersistedCartExpired = (updatedAt: unknown, now = Date.now()) =>
  typeof updatedAt !== 'number' ||
  !Number.isFinite(updatedAt) ||
  now - updatedAt > CART_TTL_MS;

const normalizeCartQuantity = (candidate: unknown) => {
  const numeric = typeof candidate === 'number' ? candidate : Number(candidate);
  if (!Number.isFinite(numeric)) {
    return 1;
  }

  return Math.max(1, Math.floor(numeric));
};

export const normalizePersistedCartItems = (
  items: unknown,
  getCurrentProduct?: (productId: string) => ProductSnapshot | undefined,
): PersistedCartItem[] => {
  const persistedItems = Array.isArray(items) ? items : [];

  return persistedItems
    .filter(
      (item): item is PersistedCartItem =>
        typeof item?.productId === 'string' &&
        typeof item.name === 'string' &&
        typeof item.priceCents === 'number' &&
        typeof item.currency === 'string' &&
        typeof item.type === 'string',
    )
    .flatMap((item) => {
      const product = getCurrentProduct?.(item.productId);
      if (product?.purchaseStatus === 'coming-soon') {
        return [];
      }

      return [{
        productId: item.productId,
        name: product?.name ?? item.name,
        priceCents: product?.priceCents ?? item.priceCents,
        currency: product?.currency ?? item.currency,
        type: product?.type ?? item.type,
        quantity: normalizeCartQuantity(item.quantity),
      }];
    });
};
