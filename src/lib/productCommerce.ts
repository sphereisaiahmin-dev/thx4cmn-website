import { getProductById, type Product } from '@/data/products';
import type { CartItem } from '@/store/cart';

import { formatCurrency } from '@/lib/format';

export const isFreeProduct = (product: Pick<Product, 'priceCents'>) => product.priceCents <= 0;

export const isFreeCartItem = (item: Pick<CartItem, 'priceCents'>) => item.priceCents <= 0;

export const isProductPurchasable = (product: Pick<Product, 'purchaseStatus'>) =>
  product.purchaseStatus === 'available';

export const getPurchaseActionLabel = (product: Pick<Product, 'purchaseStatus'>) =>
  isProductPurchasable(product) ? 'Add to cart' : 'Coming soon';

export const hasStripePrice = (product: Pick<Product, 'stripePriceId'>) =>
  Boolean(product.stripePriceId);

export const hasStripePriceForCartItem = (item: Pick<CartItem, 'productId'>) =>
  Boolean(getProductById(item.productId)?.stripePriceId);

export const getProductPriceLabel = (product: Pick<Product, 'priceCents' | 'currency'>) =>
  isFreeProduct(product) ? 'Free' : formatCurrency(product.priceCents, product.currency);

export const getCartItemPriceLabel = (item: Pick<CartItem, 'priceCents' | 'currency'>) =>
  isFreeCartItem(item) ? 'Free' : formatCurrency(item.priceCents, item.currency);

export const getProductTotalLabel = ({
  priceCents,
  quantity,
  currency,
}: Pick<CartItem, 'priceCents' | 'quantity' | 'currency'>) =>
  priceCents <= 0 ? 'Free' : formatCurrency(priceCents * quantity, currency);

export const getProductFulfillmentLabel = (
  product: Pick<Product, 'type' | 'deliveryMethod' | 'priceCents' | 'stripePriceId'>,
) => {
  if (product.type !== 'digital') {
    return 'Hardware';
  }

  if (product.deliveryMethod === 'email') {
    return isFreeProduct(product) && !hasStripePrice(product) ? 'Free digital claim' : 'Email delivery';
  }

  return 'Digital delivery';
};

export const getDigitalDeliveryNote = (
  product: Pick<Product, 'type' | 'deliveryMethod' | 'priceCents' | 'stripePriceId'>,
) => {
  if (product.type !== 'digital' || product.deliveryMethod !== 'email') {
    return null;
  }

  return isFreeProduct(product) && !hasStripePrice(product)
    ? 'Fulfilled by email after claim.'
    : 'Fulfilled by email after checkout.';
};

export const getCartItemDeliveryNote = (
  item: Pick<CartItem, 'productId' | 'type' | 'priceCents'>,
) => {
  if (item.type !== 'digital') {
    return null;
  }

  return item.priceCents <= 0 && !hasStripePriceForCartItem(item)
    ? 'Fulfilled by email after claim.'
    : 'Fulfilled by email after checkout.';
};

export const hasPaidItems = (items: ReadonlyArray<Pick<CartItem, 'priceCents'>>) =>
  items.some((item) => item.priceCents > 0);

export const hasFreeOnlyDigitalCart = (
  items: ReadonlyArray<Pick<CartItem, 'priceCents' | 'type'>>,
) => items.length > 0 && items.every((item) => item.type === 'digital' && item.priceCents <= 0);

export const hasStripeBackedCartItems = (
  items: ReadonlyArray<Pick<CartItem, 'productId'>>,
) => items.some((item) => hasStripePriceForCartItem(item));

export const cartRequiresEmailCapture = (
  items: ReadonlyArray<Pick<CartItem, 'productId' | 'priceCents' | 'type'>>,
) => hasFreeOnlyDigitalCart(items) && !hasPaidItems(items) && !hasStripeBackedCartItems(items);

export const getCartPrimaryActionLabel = (
  items: ReadonlyArray<Pick<CartItem, 'productId' | 'priceCents' | 'type'>>,
  pendingCheckoutUrl: string | null = null,
) => {
  if (cartRequiresEmailCapture(items)) {
    return 'Claim free';
  }

  return pendingCheckoutUrl ? 'Resume checkout' : 'Checkout';
};
