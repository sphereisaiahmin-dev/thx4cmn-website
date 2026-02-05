import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getProductById } from '@/data/products';
import { getStripeClient } from '@/lib/stripe';

interface CheckoutItem {
  productId: string;
  quantity: number;
}

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { items } = (await request.json()) as { items: CheckoutItem[] };

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items provided.' }, { status: 400 });
    }

    const invalidItem = items.find(
      (item) => !Number.isFinite(item.quantity) || item.quantity < 1,
    );

    if (invalidItem) {
      return NextResponse.json(
        { error: 'All items must include a quantity of at least 1.' },
        { status: 400 },
      );
    }

    const lineItems = items.map((item) => {
      const product = getProductById(item.productId);
      if (!product) {
        throw new Error(`Unknown product ${item.productId}`);
      }

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
    const originHeader = requestHeaders.get('origin');
    const forwardedProto = requestHeaders.get('x-forwarded-proto');
    const forwardedHost = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
    const origin =
      originHeader ??
      (forwardedProto && forwardedHost ? `${forwardedProto}://${forwardedHost}` : null) ??
      'http://localhost:3000';
    const stripe = getStripeClient();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}/store?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart?checkout=cancel`,
      metadata: {
        cart: JSON.stringify(items),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Unable to create checkout session.' }, { status: 500 });
  }
}
