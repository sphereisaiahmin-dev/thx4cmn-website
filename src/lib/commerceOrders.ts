import type { SupabaseClient } from '@supabase/supabase-js';

import { getProductById, normalizeProductId, type Product } from '@/data/products';
import { normalizeCheckoutEmail, type CheckoutItem } from '@/lib/checkout';
import {
  DIGITAL_FULFILLMENT_METHOD,
  DIGITAL_FULFILLMENT_PROVIDER,
  DIGITAL_FULFILLMENT_PENDING_STATUS,
} from '@/lib/digitalFulfillment';
import { createEntitlementDownloadToken } from '@/lib/downloadLinks';
import type { PendingDigitalDelivery } from '@/lib/digitalOrderFulfillment';

interface PersistCommerceOrderParams {
  supabase: SupabaseClient;
  items: CheckoutItem[];
  stripeSessionId: string;
  stripeCustomerId?: string | null;
  status: string | null;
  amountTotalCents: number;
  currency: string;
  recipientEmail: string | null;
}

interface PersistedCustomer {
  id: string;
  email: string;
  stripe_customer_id?: string | null;
}

interface PersistedOrder {
  id: string;
  stripe_session_id: string;
  stripe_customer_email: string | null;
  customer_id?: string | null;
}

interface PersistedDigitalFulfillment {
  id: string;
  status: string;
}

interface EnsureDigitalFulfillmentResult {
  fulfillment: PersistedDigitalFulfillment;
  shouldSend: boolean;
}

export interface PersistCommerceOrderResult {
  order: PersistedOrder;
  recipientEmail: string | null;
  digitalDeliveries: PendingDigitalDelivery[];
}

const aggregateCheckoutItems = (items: ReadonlyArray<CheckoutItem>) => {
  const aggregated = new Map<string, CheckoutItem>();

  items.forEach((item) => {
    const productId = normalizeProductId(item.productId);
    const existing = aggregated.get(productId);
    aggregated.set(productId, {
      productId,
      quantity: (existing?.quantity ?? 0) + item.quantity,
    });
  });

  return Array.from(aggregated.values());
};

const ensureCustomer = async ({
  supabase,
  recipientEmail,
  stripeCustomerId,
}: {
  supabase: SupabaseClient;
  recipientEmail: string | null;
  stripeCustomerId: string | null;
}) => {
  if (!recipientEmail) {
    return null;
  }

  const { data: existingCustomer, error: existingCustomerError } = await supabase
    .from('customers')
    .select('id, email, stripe_customer_id')
    .eq('email', recipientEmail)
    .maybeSingle();

  if (existingCustomerError) {
    throw existingCustomerError;
  }

  if (existingCustomer) {
    const customer = existingCustomer as PersistedCustomer;
    if (stripeCustomerId && customer.stripe_customer_id !== stripeCustomerId) {
      const { data: updatedCustomer, error: updateCustomerError } = await supabase
        .from('customers')
        .update({
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customer.id)
        .select('id, email, stripe_customer_id')
        .single();

      if (updateCustomerError) {
        throw updateCustomerError;
      }

      return updatedCustomer as PersistedCustomer;
    }

    return customer;
  }

  const customerInsert: Record<string, string> = {
    email: recipientEmail,
  };
  if (stripeCustomerId) {
    customerInsert.stripe_customer_id = stripeCustomerId;
  }

  const { data: insertedCustomer, error: insertCustomerError } = await supabase
    .from('customers')
    .insert(customerInsert)
    .select('id, email, stripe_customer_id')
    .single();

  if (insertCustomerError) {
    throw insertCustomerError;
  }

  return insertedCustomer as PersistedCustomer;
};

const ensureOrderItems = async ({
  supabase,
  orderId,
  items,
  productsById,
}: {
  supabase: SupabaseClient;
  orderId: string;
  items: ReadonlyArray<CheckoutItem>;
  productsById: Map<string, Product>;
}) => {
  const orderItems = items
    .map((item) => {
      const product = productsById.get(item.productId);
      if (!product) return null;

      return {
        order_id: orderId,
        product_id: product.id,
        quantity: item.quantity,
        unit_amount_cents: product.priceCents,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (orderItems.length === 0) {
    return;
  }

  const { data: existingOrderItems, error: existingOrderItemsError } = await supabase
    .from('order_items')
    .select('id')
    .eq('order_id', orderId)
    .limit(1);

  if (existingOrderItemsError) {
    throw existingOrderItemsError;
  }

  if (existingOrderItems && existingOrderItems.length > 0) {
    return;
  }

  const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
  if (itemsError) {
    throw itemsError;
  }
};

const ensureProducts = async ({
  supabase,
  products,
}: {
  supabase: SupabaseClient;
  products: ReadonlyArray<Product>;
}) => {
  if (products.length === 0) {
    return;
  }

  const productRows = products.map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    type: product.type,
    price_cents: product.priceCents,
    currency: product.currency,
    stripe_price_id: product.stripePriceId ?? null,
    r2_key: product.r2Key ?? null,
    active: product.purchaseStatus === 'available',
  }));

  const { error } = await supabase
    .from('products')
    .upsert(productRows, { onConflict: 'id' });

  if (error) {
    throw error;
  }
};

const ensureEntitlement = async ({
  supabase,
  orderId,
  productId,
}: {
  supabase: SupabaseClient;
  orderId: string;
  productId: string;
}) => {
  const { data: existingEntitlement, error: existingEntitlementError } = await supabase
    .from('entitlements')
    .select('id')
    .eq('order_id', orderId)
    .eq('product_id', productId)
    .maybeSingle();

  if (existingEntitlementError) {
    throw existingEntitlementError;
  }

  if (existingEntitlement) {
    return existingEntitlement as { id: string };
  }

  const { data: insertedEntitlement, error: insertEntitlementError } = await supabase
    .from('entitlements')
    .insert({
      order_id: orderId,
      product_id: productId,
      download_count: 0,
    })
    .select('id')
    .single();

  if (insertEntitlementError) {
    throw insertEntitlementError;
  }

  return insertedEntitlement as { id: string };
};

const ensureDigitalFulfillment = async ({
  supabase,
  orderId,
  product,
  recipientEmail,
}: {
  supabase: SupabaseClient;
  orderId: string;
  product: Product;
  recipientEmail: string | null;
}): Promise<EnsureDigitalFulfillmentResult> => {
  const { data: existingFulfillment, error: existingFulfillmentError } = await supabase
    .from('digital_fulfillments')
    .select('id, status')
    .eq('order_id', orderId)
    .eq('product_id', product.id)
    .maybeSingle();

  if (existingFulfillmentError) {
    throw existingFulfillmentError;
  }

  if (existingFulfillment && (existingFulfillment as PersistedDigitalFulfillment).status === 'sent') {
    return {
      fulfillment: existingFulfillment as PersistedDigitalFulfillment,
      shouldSend: false,
    };
  }

  const canSend = Boolean(recipientEmail && product.r2Key);
  const lastError = !recipientEmail
    ? 'Missing recipient email.'
    : !product.r2Key
      ? 'Product missing R2 download key.'
      : null;
  const fulfillmentValues = {
    recipient_email: recipientEmail,
    delivery_method: DIGITAL_FULFILLMENT_METHOD,
    provider: DIGITAL_FULFILLMENT_PROVIDER,
    status: canSend ? DIGITAL_FULFILLMENT_PENDING_STATUS : 'failed',
    last_error: lastError,
    updated_at: new Date().toISOString(),
  };

  if (existingFulfillment) {
    const { data: updatedFulfillment, error: updateFulfillmentError } = await supabase
      .from('digital_fulfillments')
      .update(fulfillmentValues)
      .eq('id', (existingFulfillment as PersistedDigitalFulfillment).id)
      .select('id, status')
      .single();

    if (updateFulfillmentError) {
      throw updateFulfillmentError;
    }

    return {
      fulfillment: updatedFulfillment as PersistedDigitalFulfillment,
      shouldSend: canSend,
    };
  }

  const { data: insertedFulfillment, error: insertFulfillmentError } = await supabase
    .from('digital_fulfillments')
    .insert({
      ...fulfillmentValues,
      order_id: orderId,
      product_id: product.id,
    })
    .select('id, status')
    .single();

  if (insertFulfillmentError) {
    throw insertFulfillmentError;
  }

  return {
    fulfillment: insertedFulfillment as PersistedDigitalFulfillment,
    shouldSend: canSend,
  };
};

export const persistCommerceOrder = async ({
  supabase,
  items,
  stripeSessionId,
  stripeCustomerId = null,
  status,
  amountTotalCents,
  currency,
  recipientEmail,
}: PersistCommerceOrderParams): Promise<PersistCommerceOrderResult> => {
  const normalizedRecipientEmail = normalizeCheckoutEmail(recipientEmail) || null;
  const normalizedStripeCustomerId = stripeCustomerId?.trim() || null;
  const checkoutItems = aggregateCheckoutItems(items);
  const customer = await ensureCustomer({
    supabase,
    recipientEmail: normalizedRecipientEmail,
    stripeCustomerId: normalizedStripeCustomerId,
  });

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .upsert(
      {
        stripe_session_id: stripeSessionId,
        stripe_customer_id: normalizedStripeCustomerId,
        stripe_customer_email: normalizedRecipientEmail,
        customer_id: customer?.id ?? null,
        status,
        amount_total_cents: amountTotalCents,
        currency,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'stripe_session_id' },
    )
    .select('id, stripe_session_id, stripe_customer_email, customer_id')
    .single();

  if (orderError) {
    throw orderError;
  }

  const persistedOrder = order as PersistedOrder;
  const productsById = new Map(
    checkoutItems
      .map((item) => {
        const product = getProductById(item.productId);
        return product ? [product.id, product] : null;
      })
      .filter((entry): entry is [string, Product] => Boolean(entry)),
  );

  await ensureProducts({
    supabase,
    products: Array.from(productsById.values()),
  });

  await ensureOrderItems({
    supabase,
    orderId: persistedOrder.id,
    items: checkoutItems,
    productsById,
  });

  const digitalDeliveries: PendingDigitalDelivery[] = [];
  for (const item of checkoutItems) {
    const product = productsById.get(item.productId);
    if (!product || product.type !== 'digital') {
      continue;
    }

    let downloadToken: string | null = null;
    let digitalFulfillment: EnsureDigitalFulfillmentResult | null = null;
    const entitlement = await ensureEntitlement({
      supabase,
      orderId: persistedOrder.id,
      productId: product.id,
    });

    if (product.deliveryMethod === DIGITAL_FULFILLMENT_METHOD) {
      digitalFulfillment = await ensureDigitalFulfillment({
        supabase,
        orderId: persistedOrder.id,
        product,
        recipientEmail: normalizedRecipientEmail,
      });

      if (digitalFulfillment.shouldSend && product.r2Key) {
        downloadToken = await createEntitlementDownloadToken({
          supabase,
          entitlementId: entitlement.id,
          purpose: 'email',
        });
      }
    }

    if (downloadToken && digitalFulfillment) {
      digitalDeliveries.push({
        fulfillmentId: digitalFulfillment.fulfillment.id,
        productId: product.id,
        productName: product.name,
        downloadToken,
      });
    }
  }

  return {
    order: persistedOrder,
    recipientEmail: normalizedRecipientEmail,
    digitalDeliveries,
  };
};
