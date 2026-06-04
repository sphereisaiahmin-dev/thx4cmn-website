import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getProductById } from '@/data/products';
import {
  isValidCheckoutEmail,
  normalizeCheckoutEmail,
  parseCheckoutItemsPayload,
} from '@/lib/checkout';
import { persistCommerceOrder } from '@/lib/commerceOrders';
import { createServerClient } from '@/lib/supabase/server';
import { getStripeClient } from '@/lib/stripe';
import {
  buildStripeCheckoutLineItems,
  shouldUseStripeCheckout,
} from '@/lib/stripeCheckout';

export const runtime = 'nodejs';

const APP_ORIGIN_ENV_KEY = 'APP_ORIGIN';

const normalizeOrigin = (candidate: string | null) => {
  if (!candidate) return null;

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
};

const resolveCheckoutOrigin = (requestHeaders: Headers) => {
  const configuredOrigin = normalizeOrigin(process.env[APP_ORIGIN_ENV_KEY] ?? null);
  if (process.env.NODE_ENV === 'production') {
    if (!configuredOrigin) {
      throw new Error(`${APP_ORIGIN_ENV_KEY} must be configured for production checkout.`);
    }
    return configuredOrigin;
  }

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const originHeader = normalizeOrigin(requestHeaders.get('origin'));
  if (originHeader) {
    return originHeader;
  }

  const forwardedProto = requestHeaders.get('x-forwarded-proto');
  const forwardedHost = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const forwardedOrigin =
    forwardedProto && forwardedHost ? normalizeOrigin(`${forwardedProto}://${forwardedHost}`) : null;

  return forwardedOrigin ?? 'http://localhost:3000';
};

export async function POST(request: Request) {
  const requestId = globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}`;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Malformed checkout JSON payload.', requestId },
      { status: 400 },
    );
  }

  const parsedItems = parseCheckoutItemsPayload(payload);
  if (!parsedItems.ok) {
    return NextResponse.json(
      { error: parsedItems.error, requestId },
      { status: 400 },
    );
  }

  const items = parsedItems.items;
  const recipientEmail = normalizeCheckoutEmail(
    typeof payload === 'object' && payload !== null && 'email' in payload
      ? (payload as { email?: unknown }).email
      : undefined,
  );
  const unknownProduct = items.find((item) => !getProductById(item.productId));
  if (unknownProduct) {
    return NextResponse.json(
      { error: `Unknown product "${unknownProduct.productId}".`, requestId },
      { status: 400 },
    );
  }

  try {
    const products = items.map((item) => ({
      item,
      product: getProductById(item.productId)!,
    }));
    const usesStripeCheckout = shouldUseStripeCheckout(products);
    const requiresEmailForFreeClaim = products.some(
      ({ product }) => product.type === 'digital' && product.deliveryMethod === 'email',
    );
    const requestHeaders = await headers();
    const origin = resolveCheckoutOrigin(requestHeaders);

    if (!usesStripeCheckout) {
      if (requiresEmailForFreeClaim && !isValidCheckoutEmail(recipientEmail)) {
        return NextResponse.json(
          { error: 'A valid email is required to claim free digital items.', requestId },
          { status: 400 },
        );
      }

      const supabase = createServerClient();
      const order = await persistCommerceOrder({
        supabase,
        items,
        stripeSessionId: `free_claim_${requestId}`,
        status: 'no_payment_required',
        amountTotalCents: 0,
        currency: products[0]?.product.currency ?? 'USD',
        recipientEmail: requiresEmailForFreeClaim ? recipientEmail : null,
      });

      return NextResponse.json({
        url: `${origin}/cart?checkout=success&mode=free-claim&order_id=${order.id}`,
        requestId,
        persistCheckoutUrl: false,
      });
    }

    const lineItems = buildStripeCheckoutLineItems(products);
    const stripe = getStripeClient();
    const logContext = {
      requestId,
      itemCount: items.length,
      origin,
      usingConfiguredOrigin: Boolean(process.env[APP_ORIGIN_ENV_KEY]),
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      ui_mode: 'elements',
      line_items: lineItems,
      return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      metadata: {
        cart: JSON.stringify(items),
      },
    });

    if (!session.client_secret) {
      console.error('Stripe checkout session missing client secret.', {
        ...logContext,
        sessionId: session.id,
      });
      return NextResponse.json(
        { error: 'Checkout session did not return a client secret.', requestId },
        { status: 500 },
      );
    }

    return NextResponse.json({
      clientSecret: session.client_secret,
      sessionId: session.id,
      requestId,
      persistCheckoutUrl: false,
    });
  } catch (error) {
    const isStripeError = error instanceof Stripe.errors.StripeError;
    console.error('Stripe checkout error.', {
      requestId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      stripeType: isStripeError ? error.type : undefined,
      stripeCode: isStripeError ? error.code : undefined,
      stripeRequestId: isStripeError ? error.requestId : undefined,
      rawError: isStripeError ? error.raw : undefined,
    });
    return NextResponse.json(
      { error: 'Unable to create checkout session.', requestId },
      { status: 500 },
    );
  }
}
