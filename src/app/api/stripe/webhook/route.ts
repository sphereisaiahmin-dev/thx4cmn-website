import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { parseCheckoutItemsPayload } from '@/lib/checkout';
import { persistCommerceOrder } from '@/lib/commerceOrders';
import { getStripeClient } from '@/lib/stripe';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const stripeSignature = (await headers()).get('stripe-signature');
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

    let metadataItemsPayload: unknown;
    try {
      metadataItemsPayload = JSON.parse(metadata) as unknown;
    } catch {
      console.error('Checkout metadata cart is invalid JSON.', {
        sessionId: session.id,
      });
      return NextResponse.json({ received: true });
    }

    const parsedMetadataItems = parseCheckoutItemsPayload({ items: metadataItemsPayload });
    if (!parsedMetadataItems.ok) {
      console.error('Checkout metadata cart payload is invalid.', {
        sessionId: session.id,
        error: parsedMetadataItems.error,
      });
      return NextResponse.json({ received: true });
    }

    const items = parsedMetadataItems.items;

    const supabase = createServerClient();
    try {
      await persistCommerceOrder({
        supabase,
        items,
        stripeSessionId: session.id,
        status: session.payment_status,
        amountTotalCents: session.amount_total ?? 0,
        currency: session.currency ?? 'usd',
        recipientEmail: session.customer_details?.email ?? null,
      });
    } catch (orderError) {
      console.error(orderError);
      return NextResponse.json({ error: 'Unable to save order.' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
