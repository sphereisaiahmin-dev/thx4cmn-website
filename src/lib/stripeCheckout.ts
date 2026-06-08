import type Stripe from 'stripe';

import type { Product } from '../data/products';
import type { CheckoutItem } from './checkout';

const COMMUNITY_FREE_PACK_PRODUCT_ID = 'community-vol-1-free-pack';

export interface CheckoutProductSelection {
  item: CheckoutItem;
  product: Product;
}

export const isStripeBackedCheckoutProduct = (product: Pick<Product, 'priceCents' | 'stripePriceId'>) =>
  Boolean(product.stripePriceId) || product.priceCents > 0;

export const isCommunityFreePackOnlyCheckout = (
  products: ReadonlyArray<CheckoutProductSelection>,
) =>
  products.length === 1 &&
  products[0].product.id === COMMUNITY_FREE_PACK_PRODUCT_ID &&
  products[0].product.type === 'digital' &&
  products[0].product.deliveryMethod === 'email' &&
  products[0].product.priceCents <= 0;

export const buildStripeCheckoutLineItems = (
  products: ReadonlyArray<CheckoutProductSelection>,
): Stripe.Checkout.SessionCreateParams.LineItem[] =>
  products
    .filter(({ product }) => isStripeBackedCheckoutProduct(product))
    .map(({ item, product }) => {
      if (product.stripePriceId) {
        return {
          price: product.stripePriceId,
          quantity: item.quantity,
        };
      }

      return {
        price_data: {
          currency: product.currency,
          product_data: {
            name: product.name,
            description: product.description,
          },
          unit_amount: product.priceCents,
        },
        quantity: item.quantity,
      };
    });

export const shouldUseStripeCheckout = (products: ReadonlyArray<CheckoutProductSelection>) =>
  !isCommunityFreePackOnlyCheckout(products) &&
  products.some(({ product }) => isStripeBackedCheckoutProduct(product));
