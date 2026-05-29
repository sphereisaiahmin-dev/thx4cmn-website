import type { Product } from '@/data/products';

interface StripeCheckoutLineItem {
  quantity: number;
  price?: string;
  price_data?: {
    currency: string;
    product_data: {
      name: string;
      description: string;
    };
    unit_amount: number;
  };
}

export const buildStripeCheckoutLineItem = (
  product: Product,
  quantity: number,
): StripeCheckoutLineItem => {
  if (product.stripePriceId && product.priceCents > 0) {
    return {
      price: product.stripePriceId,
      quantity,
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
    quantity,
  };
};
