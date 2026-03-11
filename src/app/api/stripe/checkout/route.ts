import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getProductById } from '@/data/products';
import { parseCheckoutItemsPayload } from '@/lib/checkout';
import { getStripeClient } from '@/lib/stripe';

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
  const unknownProduct = items.find((item) => !getProductById(item.productId));
  if (unknownProduct) {
    return NextResponse.json(
      { error: `Unknown product "${unknownProduct.productId}".`, requestId },
      { status: 400 },
    );
  }

  try {
    const lineItems = items.map((item) => {
      const product = getProductById(item.productId)!;

      if (product.stripePriceId) {
        return {
          price: product.stripePriceId,
          quantity: item.quantity,
        } as const;
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
      } as const;
    });

    const requestHeaders = headers();
    const origin = resolveCheckoutOrigin(requestHeaders);
    const stripe = getStripeClient();
    const logContext = {
      requestId,
      itemCount: items.length,
      origin,
      usingConfiguredOrigin: Boolean(process.env[APP_ORIGIN_ENV_KEY]),
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}/store?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart?checkout=cancel`,
      metadata: {
        cart: JSON.stringify(items),
      },
    });

    if (!session.url) {
      console.error('Stripe checkout session missing URL.', {
        ...logContext,
        sessionId: session.id,
      });
      return NextResponse.json(
        { error: 'Checkout session did not return a URL.', requestId },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url, requestId });
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
