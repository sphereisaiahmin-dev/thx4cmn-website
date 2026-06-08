import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getProductById } from '@/data/products';
import { resolveAppOrigin } from '@/lib/appOrigin';
import {
  isValidCheckoutEmail,
  normalizeCheckoutEmail,
  parseCheckoutItemsPayload,
} from '@/lib/checkout';
import {
  createCheckoutReturnMetadata,
  createCheckoutReturnToken,
} from '@/lib/checkoutReturnAccess';
import { persistCommerceOrder } from '@/lib/commerceOrders';
import { fulfillDigitalOrder } from '@/lib/digitalOrderFulfillment';
import { createOrderDownloadLinks } from '@/lib/downloadLinks';
import { createServerClient } from '@/lib/supabase/server';
import { isProductPurchasable } from '@/lib/productCommerce';
import { getStripeClient } from '@/lib/stripe';
import {
  buildStripeCheckoutLineItems,
  shouldUseStripeCheckout,
} from '@/lib/stripeCheckout';

export const runtime = 'nodejs';

const toReceiptItems = (
  products: ReadonlyArray<{
    item: { quantity: number };
    product: { name: string; priceCents: number };
  }>,
) =>
  products.map(({ item, product }) => ({
    productName: product.name,
    quantity: item.quantity,
    unitAmountCents: product.priceCents,
  }));

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
    const unavailableProduct = products.find(({ product }) => !isProductPurchasable(product));
    if (unavailableProduct) {
      return NextResponse.json(
        { error: `${unavailableProduct.product.name} is coming soon.`, requestId },
        { status: 400 },
      );
    }

    const receiptItems = toReceiptItems(products);
    const usesStripeCheckout = shouldUseStripeCheckout(products);
    const requiresEmailForFreeClaim = products.some(
      ({ product }) => product.type === 'digital' && product.deliveryMethod === 'email',
    );
    const requestHeaders = await headers();
    const origin = resolveAppOrigin(requestHeaders);

    if (!usesStripeCheckout) {
      if (requiresEmailForFreeClaim && !isValidCheckoutEmail(recipientEmail)) {
        return NextResponse.json(
          { error: 'A valid email is required to claim free digital items.', requestId },
          { status: 400 },
        );
      }

      const supabase = createServerClient();
      const persistedOrder = await persistCommerceOrder({
        supabase,
        items,
        stripeSessionId: `free_claim_${requestId}`,
        status: 'no_payment_required',
        amountTotalCents: 0,
        currency: products[0]?.product.currency ?? 'USD',
        recipientEmail: requiresEmailForFreeClaim ? recipientEmail : null,
      });
      let fulfillmentError: string | null = null;
      try {
        await fulfillDigitalOrder({
          supabase,
          orderId: persistedOrder.order.id,
          recipientEmail: persistedOrder.recipientEmail,
          deliveries: persistedOrder.digitalDeliveries,
          appOrigin: origin,
          paymentStatus: 'no_payment_required',
          amountTotalCents: 0,
          currency: products[0]?.product.currency ?? 'USD',
          receiptItems,
        });
      } catch (error) {
        fulfillmentError =
          error instanceof Error ? error.message : 'Unable to send fulfillment email.';
        console.error('Free claim fulfillment email failed.', {
          requestId,
          orderId: persistedOrder.order.id,
          error,
        });
      }
      const checkoutReturnToken = createCheckoutReturnToken();
      const downloadLinks = await createOrderDownloadLinks({
        supabase,
        orderId: persistedOrder.order.id,
        appOrigin: origin,
        returnToken: checkoutReturnToken,
      });
      const claimToken =
        downloadLinks[0]?.downloadUrl &&
        new URL(downloadLinks[0].downloadUrl).searchParams.get('token');
      if (!claimToken) {
        throw new Error('Unable to create free claim return token.');
      }

      return NextResponse.json({
        url: `${origin}/checkout/return?${new URLSearchParams({
          claim_token: claimToken,
        }).toString()}`,
        requestId,
        persistCheckoutUrl: false,
        fulfillmentError,
      });
    }

    const lineItems = buildStripeCheckoutLineItems(products);
    const stripe = getStripeClient();
    const logContext = {
      requestId,
      itemCount: items.length,
      origin,
      usingConfiguredOrigin: Boolean(process.env.APP_ORIGIN),
    };
    const returnToken = createCheckoutReturnToken();
    const returnTokenMetadata = createCheckoutReturnMetadata(returnToken);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      ui_mode: 'elements',
      customer_creation: 'always',
      line_items: lineItems,
      return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}&return_token=${encodeURIComponent(returnToken)}`,
      metadata: {
        cart: JSON.stringify(items),
        ...returnTokenMetadata,
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
      returnToken,
      requestId,
      persistCheckoutUrl: false,
    });
  } catch (error) {
    const isStripeError = error instanceof Stripe.errors.StripeError;
    console.error('Checkout error.', {
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
