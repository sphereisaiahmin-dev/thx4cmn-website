import type { SupabaseClient } from '@supabase/supabase-js';

import { getProductById } from '@/data/products';
import { createDigitalFulfillmentRows } from '@/lib/digitalFulfillment';
import type { CheckoutItem } from '@/lib/checkout';

interface PersistCommerceOrderParams {
  supabase: SupabaseClient;
  items: CheckoutItem[];
  stripeSessionId: string;
  status: string | null;
  amountTotalCents: number;
  currency: string;
  recipientEmail: string | null;
}

export const persistCommerceOrder = async ({
  supabase,
  items,
  stripeSessionId,
  status,
  amountTotalCents,
  currency,
  recipientEmail,
}: PersistCommerceOrderParams) => {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .upsert({
      stripe_session_id: stripeSessionId,
      stripe_customer_email: recipientEmail,
      status,
      amount_total_cents: amountTotalCents,
      currency,
    })
    .select()
    .single();

  if (orderError) {
    throw orderError;
  }

  const productsById = new Map(
    items
      .map((item) => {
        const product = getProductById(item.productId);
        return product ? [product.id, product] : null;
      })
      .filter((entry): entry is [string, NonNullable<ReturnType<typeof getProductById>>] => Boolean(entry)),
  );

  const orderItems = items
    .map((item) => {
      const product = productsById.get(item.productId);
      if (!product) return null;

      return {
        order_id: order.id,
        product_id: product.id,
        quantity: item.quantity,
        unit_amount_cents: product.priceCents,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (orderItems.length > 0) {
    const { data: existingOrderItems, error: existingOrderItemsError } = await supabase
      .from('order_items')
      .select('id')
      .eq('order_id', order.id)
      .limit(1);

    if (existingOrderItemsError) {
      console.error(existingOrderItemsError);
    } else if (!existingOrderItems || existingOrderItems.length === 0) {
      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) {
        console.error(itemsError);
      }
    }
  }

  const entitlementRows = items
    .map((item) => {
      const product = productsById.get(item.productId);
      if (!product || product.type !== 'digital') return null;

      return {
        order_id: order.id,
        product_id: product.id,
        download_count: 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (entitlementRows.length > 0) {
    const { data: existingEntitlements, error: existingEntitlementsError } = await supabase
      .from('entitlements')
      .select('id')
      .eq('order_id', order.id)
      .limit(1);

    if (existingEntitlementsError) {
      console.error(existingEntitlementsError);
    } else if (!existingEntitlements || existingEntitlements.length === 0) {
      const { error: entitlementsError } = await supabase.from('entitlements').insert(entitlementRows);
      if (entitlementsError) {
        console.error(entitlementsError);
      }
    }
  }

  const digitalFulfillmentRows = createDigitalFulfillmentRows({
    items,
    productsById,
    orderId: order.id,
    recipientEmail,
  });

  if (digitalFulfillmentRows.length > 0) {
    const { data: existingDigitalFulfillments, error: existingDigitalFulfillmentsError } =
      await supabase.from('digital_fulfillments').select('id').eq('order_id', order.id).limit(1);

    if (existingDigitalFulfillmentsError) {
      console.error(existingDigitalFulfillmentsError);
    } else if (!existingDigitalFulfillments || existingDigitalFulfillments.length === 0) {
      const { error: digitalFulfillmentsError } = await supabase
        .from('digital_fulfillments')
        .insert(digitalFulfillmentRows);
      if (digitalFulfillmentsError) {
        console.error(digitalFulfillmentsError);
      }
    }
  }

  return order;
};
