import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getProductById } from '@/data/products';
import { getStripeClient } from '@/lib/stripe';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const stripeSignature = headers().get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSignature || !webhookSecret) {
    return NextResponse.json({ error: 'Missing Stripe webhook signature.' }, { status: 400 });
  }

  const body = await request.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, stripeSignature, webhookSecret);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata?.cart;

    if (!metadata) {
      return NextResponse.json({ received: true });
    }

    const items = JSON.parse(metadata) as Array<{ productId: string; quantity: number }>;

    const supabase = createServerClient();
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .upsert({
        stripe_session_id: session.id,
        stripe_customer_email: session.customer_details?.email,
        status: session.payment_status,
        amount_total_cents: session.amount_total,
        currency: session.currency,
      })
      .select()
      .single();

    if (orderError) {
      console.error(orderError);
      return NextResponse.json({ error: 'Unable to save order.' }, { status: 500 });
    }

    const orderItems = items
      .map((item) => {
        const product = getProductById(item.productId);
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
      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) {
        console.error(itemsError);
      }
    }

    const entitlementRows = items
      .map((item) => {
        const product = getProductById(item.productId);
        if (!product || product.type !== 'digital') return null;
        return {
          order_id: order.id,
          product_id: product.id,
          download_count: 0,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (entitlementRows.length > 0) {
      const { error: entitlementsError } = await supabase
        .from('entitlements')
        .insert(entitlementRows);
      if (entitlementsError) {
        console.error(entitlementsError);
      }
    }
  }

  return NextResponse.json({ received: true });
}
