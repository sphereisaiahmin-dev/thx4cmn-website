import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getStripeClient } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const requestId = globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}`;
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id')?.trim();

  if (!sessionId || !sessionId.startsWith('cs_')) {
    return NextResponse.json(
      { error: 'Missing or invalid checkout session ID.', requestId },
      { status: 400 },
    );
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return NextResponse.json({
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      customerEmail: session.customer_details?.email ?? null,
      clientSecret: session.status === 'open' ? session.client_secret : null,
      requestId,
    });
  } catch (error) {
    const isStripeError = error instanceof Stripe.errors.StripeError;
    console.error('Stripe checkout session lookup error.', {
      requestId,
      sessionId,
      message: error instanceof Error ? error.message : String(error),
      stripeType: isStripeError ? error.type : undefined,
      stripeCode: isStripeError ? error.code : undefined,
      stripeRequestId: isStripeError ? error.requestId : undefined,
    });

    return NextResponse.json(
      { error: 'Unable to retrieve checkout session.', requestId },
      { status: 500 },
    );
  }
}
