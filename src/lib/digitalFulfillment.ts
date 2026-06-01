import type { Product } from '@/data/products';
import type { CheckoutItem } from '@/lib/checkout';

export const DIGITAL_FULFILLMENT_METHOD = 'email';
export const DIGITAL_FULFILLMENT_PROVIDER = 'pending_email_service';
export const DIGITAL_FULFILLMENT_PENDING_STATUS = 'pending';

export const createDigitalFulfillmentRows = ({
  items,
  productsById,
  orderId,
  recipientEmail,
}: {
  items: ReadonlyArray<CheckoutItem>;
  productsById: Map<string, Product>;
  orderId: string;
  recipientEmail: string | null;
}) =>
  items
    .map((item) => {
      const product = productsById.get(item.productId);
      if (!product || product.type !== 'digital' || product.deliveryMethod !== 'email') {
        return null;
      }

      return {
        order_id: orderId,
        product_id: product.id,
        recipient_email: recipientEmail,
        delivery_method: DIGITAL_FULFILLMENT_METHOD,
        provider: DIGITAL_FULFILLMENT_PROVIDER,
        status: DIGITAL_FULFILLMENT_PENDING_STATUS,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
