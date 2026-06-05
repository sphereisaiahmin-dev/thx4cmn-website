import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { resolveAppOrigin } from '@/lib/appOrigin';
import { parseCheckoutItemsPayload } from '@/lib/checkout';
import { persistCommerceOrder } from '@/lib/commerceOrders';
import { createOrderDownloadLinks } from '@/lib/downloadLinks';
import { fulfillDigitalOrder } from '@/lib/digitalOrderFulfillment';
import { getStripeClient } from '@/lib/stripe';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const getStripeCustomerId = (session: Stripe.Checkout.Session) =>
  typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

const getReceiptUrl = (session: Stripe.Checkout.Session) => {
  const paymentIntent =
    typeof session.payment_intent === 'object' && session.payment_intent !== null
      ? session.payment_intent
      : null;
  const latestCharge =
    paymentIntent &&
    typeof paymentIntent.latest_charge === 'object' &&
    paymentIntent.latest_charge !== null
      ? paymentIntent.latest_charge
      : null;

  return latestCharge && 'receipt_url' in latestCharge ? latestCharge.receipt_url : null;
};

const canFulfillSession = (session: Stripe.Checkout.Session) =>
  session.status === 'complete' &&
  (session.payment_status === 'paid' || session.payment_status === 'no_payment_required');

const parseSessionCheckoutItems = (session: Stripe.Checkout.Session) => {
  const metadata = session.metadata?.cart;
  if (!metadata) {
    return { ok: false, error: 'Checkout metadata cart is missing.' } as const;
  }

  let metadataItemsPayload: unknown;
  try {
    metadataItemsPayload = JSON.parse(metadata) as unknown;
  } catch {
    return { ok: false, error: 'Checkout metadata cart is invalid JSON.' } as const;
  }

  return parseCheckoutItemsPayload({ items: metadataItemsPayload });
};

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
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent.latest_charge'],
    });
    const supabase = createServerClient();
    const downloadLinks: Array<{
      productId: string;
      productName: string;
      downloadUrl: string;
    }> = [];
    let orderId: string | null = null;
    let fulfillmentError: string | null = null;

    if (canFulfillSession(session)) {
      const parsedItems = parseSessionCheckoutItems(session);
      const origin = resolveAppOrigin(request.headers);

      if (parsedItems.ok) {
        try {
          const persistedOrder = await persistCommerceOrder({
            supabase,
            items: parsedItems.items,
            stripeSessionId: session.id,
            stripeCustomerId: getStripeCustomerId(session),
            status: session.payment_status,
            amountTotalCents: session.amount_total ?? 0,
            currency: session.currency ?? 'usd',
            recipientEmail: session.customer_details?.email ?? session.customer_email ?? null,
          });
          orderId = persistedOrder.order.id;

          try {
            await fulfillDigitalOrder({
              supabase,
              orderId,
              recipientEmail: persistedOrder.recipientEmail,
              deliveries: persistedOrder.digitalDeliveries,
              appOrigin: origin,
            });
          } catch (error) {
            fulfillmentError = error instanceof Error ? error.message : 'Unable to send fulfillment email.';
            console.error('Checkout return fulfillment email failed.', {
              requestId,
              sessionId,
              error,
            });
          }
        } catch (error) {
          console.error('Checkout return order persistence failed.', {
            requestId,
            sessionId,
            error,
          });
          throw error;
        }
      } else {
        console.error('Checkout return metadata payload is invalid.', {
          requestId,
          sessionId,
          error: parsedItems.error,
        });

        const { data: existingOrder, error: existingOrderError } = await supabase
          .from('orders')
          .select('id')
          .eq('stripe_session_id', session.id)
          .maybeSingle();

        if (existingOrderError) {
          throw existingOrderError;
        }

        orderId = existingOrder ? (existingOrder as { id: string }).id : null;
      }

      if (orderId) {
        downloadLinks.push(
          ...(await createOrderDownloadLinks({
            supabase,
            orderId,
            appOrigin: origin,
          })),
        );
      }
    }

    return NextResponse.json({
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      orderId,
      customerEmail: session.customer_details?.email ?? null,
      receiptUrl: getReceiptUrl(session),
      downloadLinks,
      fulfillmentError,
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
