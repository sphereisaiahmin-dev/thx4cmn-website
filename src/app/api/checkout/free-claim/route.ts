import { NextResponse } from 'next/server';

import { modelUrlsByProductId } from '@/components/productModelUrls';
import { getProductById } from '@/data/products';
import { resolveAppOrigin } from '@/lib/appOrigin';
import {
  hasDownloadTokenReachedLimit,
  hashDownloadToken,
  isDownloadTokenExpired,
} from '@/lib/downloadTokens';
import { toDownloadUrl } from '@/lib/downloadLinks';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface EntitlementDownloadTokenRow {
  entitlement_id: string;
  purpose: string;
  expires_at: string | null;
  download_count: number | null;
  max_downloads: number | null;
}

interface EntitlementRow {
  id: string;
  order_id: string;
  product_id: string;
}

interface OrderRow {
  id: string;
  status: string | null;
  amount_total_cents: number | null;
  currency: string | null;
  stripe_customer_email: string | null;
}

interface OrderItemRow {
  product_id: string;
  quantity: number;
  unit_amount_cents: number;
}

interface DigitalFulfillmentRow {
  status: string;
  last_error: string | null;
}

const formatTokenError = (requestId: string, message: string, status = 400) =>
  NextResponse.json({ error: message, requestId }, { status });

export async function GET(request: Request) {
  const requestId = globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}`;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('claim_token')?.trim() ?? '';

  if (!token) {
    return formatTokenError(requestId, 'Missing free claim token.');
  }

  try {
    const supabase = createServerClient();
    const { data: tokenRecord, error: tokenError } = await supabase
      .from('entitlement_download_tokens')
      .select('entitlement_id, purpose, expires_at, download_count, max_downloads')
      .eq('token_hash', hashDownloadToken(token))
      .maybeSingle();

    if (tokenError) {
      throw tokenError;
    }

    if (!tokenRecord || (tokenRecord as EntitlementDownloadTokenRow).purpose !== 'checkout_return') {
      return formatTokenError(requestId, 'Free claim token is invalid.', 404);
    }

    const returnToken = tokenRecord as EntitlementDownloadTokenRow;
    if (isDownloadTokenExpired(returnToken.expires_at)) {
      return formatTokenError(requestId, 'Free claim token expired.', 403);
    }

    const { data: entitlement, error: entitlementError } = await supabase
      .from('entitlements')
      .select('id, order_id, product_id')
      .eq('id', returnToken.entitlement_id)
      .maybeSingle();

    if (entitlementError) {
      throw entitlementError;
    }

    if (!entitlement) {
      return formatTokenError(requestId, 'Free claim entitlement was not found.', 404);
    }

    const entitlementRow = entitlement as EntitlementRow;
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, amount_total_cents, currency, stripe_customer_email')
      .eq('id', entitlementRow.order_id)
      .maybeSingle();

    if (orderError) {
      throw orderError;
    }

    if (!order) {
      return formatTokenError(requestId, 'Free claim order was not found.', 404);
    }

    const orderRow = order as OrderRow;
    const { data: orderItems, error: orderItemsError } = await supabase
      .from('order_items')
      .select('product_id, quantity, unit_amount_cents')
      .eq('order_id', orderRow.id);

    if (orderItemsError) {
      throw orderItemsError;
    }

    const { data: fulfillment, error: fulfillmentError } = await supabase
      .from('digital_fulfillments')
      .select('status, last_error')
      .eq('order_id', orderRow.id)
      .eq('product_id', entitlementRow.product_id)
      .maybeSingle();

    if (fulfillmentError) {
      throw fulfillmentError;
    }

    const receiptItems = ((orderItems ?? []) as OrderItemRow[]).map((item) => {
      const product = getProductById(item.product_id);
      const productId = product?.id ?? item.product_id;

      return {
        productId,
        productName: product?.name ?? item.product_id,
        quantity: item.quantity,
        unitAmountCents: item.unit_amount_cents,
        modelUrl: modelUrlsByProductId[productId] ?? null,
      };
    });
    const fulfillmentRow = fulfillment as DigitalFulfillmentRow | null;
    const downloadLimitReached = hasDownloadTokenReachedLimit(
      returnToken.download_count,
      returnToken.max_downloads,
    );

    return NextResponse.json({
      id: `free_claim_${orderRow.id}`,
      status: 'complete',
      paymentStatus: 'no_payment_required',
      orderId: orderRow.id,
      amountTotal: orderRow.amount_total_cents ?? 0,
      currency: orderRow.currency ?? 'USD',
      customerEmail: orderRow.stripe_customer_email,
      receiptUrl: null,
      receiptItems,
      downloadLinks: downloadLimitReached
        ? []
        : [
            {
              productId: entitlementRow.product_id,
              productName: getProductById(entitlementRow.product_id)?.name ?? entitlementRow.product_id,
              downloadUrl: toDownloadUrl(resolveAppOrigin(request.headers), token),
            },
          ],
      fulfillmentError: fulfillmentRow?.status === 'failed' ? fulfillmentRow.last_error : null,
      emailFulfillmentStatus: fulfillmentRow?.status ?? null,
      requestId,
    });
  } catch (error) {
    console.error('Free claim status lookup error.', {
      requestId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { error: 'Unable to load free claim status.', requestId },
      { status: 500 },
    );
  }
}
