'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { CompactProductModel } from '@/components/CompactProductModel';
import { CHECKOUT_SESSION_STORAGE_KEY } from '@/lib/checkoutSessionStorage';
import { formatCurrency } from '@/lib/format';
import { useCartStore } from '@/store/cart';

interface CheckoutReceiptItem {
  productId: string;
  productName: string;
  quantity: number;
  unitAmountCents: number;
  modelUrl?: string | null;
}

interface CheckoutSessionStatusPayload {
  id?: string;
  status?: 'open' | 'complete' | 'expired' | null;
  paymentStatus?: 'paid' | 'unpaid' | 'no_payment_required' | null;
  orderId?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
  customerEmail?: string | null;
  receiptUrl?: string | null;
  receiptItems?: CheckoutReceiptItem[];
  downloadLinks?: Array<{
    productId: string;
    productName: string;
    downloadUrl: string;
  }>;
  fulfillmentError?: string | null;
  requestId?: string;
  error?: string;
}

type StatusState =
  | { type: 'loading' }
  | {
      type: 'complete';
      orderId: string | null;
      customerEmail: string | null;
      paymentStatus: CheckoutSessionStatusPayload['paymentStatus'];
      amountTotal: number | null;
      currency: string | null;
      receiptItems: CheckoutReceiptItem[];
      downloadLinks: NonNullable<CheckoutSessionStatusPayload['downloadLinks']>;
      fulfillmentError: string | null;
    }
  | { type: 'open'; sessionId: string }
  | { type: 'expired' }
  | { type: 'error'; message: string };

const clearStoredCheckoutSession = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
};

const formatOrderReference = (orderId: string | null) =>
  orderId ? orderId.slice(0, 8).toUpperCase() : 'Pending';

const formatPaymentStatus = (status: CheckoutSessionStatusPayload['paymentStatus']) => {
  if (status === 'no_payment_required') return 'No payment required';
  if (status === 'paid') return 'Paid';
  if (status === 'unpaid') return 'Unpaid';
  return 'Recorded';
};

function CheckoutReturnContent() {
  const searchParams = useSearchParams();
  const clear = useCartStore((state) => state.clear);
  const sessionId = searchParams.get('session_id')?.trim() ?? '';
  const [statusState, setStatusState] = useState<StatusState>({ type: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    const loadSessionStatus = async () => {
      if (!sessionId) {
        setStatusState({ type: 'error', message: 'Missing checkout session ID.' });
        return;
      }

      try {
        const response = await fetch(
          `/api/stripe/session?session_id=${encodeURIComponent(sessionId)}`,
          { signal: controller.signal },
        );
        const payload = (await response.json().catch(() => null)) as
          | CheckoutSessionStatusPayload
          | null;

        if (!response.ok) {
          const message = payload?.error ?? 'Unable to load checkout status.';
          const requestId = payload?.requestId ? ` (requestId: ${payload.requestId})` : '';
          throw new Error(`${message}${requestId}`);
        }

        if (controller.signal.aborted) return;

        if (payload?.status === 'complete') {
          clear();
          clearStoredCheckoutSession();
          setStatusState({
            type: 'complete',
            orderId: payload.orderId ?? null,
            customerEmail: payload.customerEmail ?? null,
            paymentStatus: payload.paymentStatus ?? null,
            amountTotal: payload.amountTotal ?? null,
            currency: payload.currency ?? null,
            receiptItems: payload.receiptItems ?? [],
            downloadLinks: payload.downloadLinks ?? [],
            fulfillmentError: payload.fulfillmentError ?? null,
          });
          return;
        }

        if (payload?.status === 'open') {
          setStatusState({ type: 'open', sessionId: payload.id ?? sessionId });
          return;
        }

        if (payload?.status === 'expired') {
          clearStoredCheckoutSession();
          setStatusState({ type: 'expired' });
          return;
        }

        setStatusState({ type: 'error', message: 'Checkout status is unavailable.' });
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatusState({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unable to load checkout status.',
        });
      }
    };

    void loadSessionStatus();
    return () => controller.abort();
  }, [clear, sessionId]);

  const title =
    statusState.type === 'complete'
      ? 'Checkout complete'
      : statusState.type === 'open'
        ? 'Checkout pending'
        : statusState.type === 'expired'
          ? 'Checkout expired'
          : 'Checkout status';

  return (
    <section className="space-y-10">
      <div className="showcase-transition-title text-center">
        <h1 className="text-3xl uppercase tracking-[0.3em]">{title}</h1>
      </div>

      <div className="showcase-transition-cards mx-auto w-full max-w-5xl rounded-2xl border border-black/10 bg-white/70 p-6 text-sm text-black/68 backdrop-blur-sm">
        {statusState.type === 'loading' ? <p>Loading checkout status...</p> : null}

        {statusState.type === 'complete' ? (
          <div className="space-y-4">
            <p>
              {statusState.paymentStatus === 'no_payment_required'
                ? 'Your free checkout is recorded. Digital delivery is queued for email fulfillment.'
                : 'Checkout received. Digital delivery items are ready below and will also be fulfilled by email.'}
            </p>

            <div className="space-y-3 border-t border-black/10 pt-4">
              <p className="text-[0.62rem] uppercase tracking-[0.3em] text-black/52">Receipt</p>
              <dl className="grid gap-3 text-xs text-black/60 sm:grid-cols-2">
                <div>
                  <dt className="uppercase tracking-[0.22em] text-black/42">Order</dt>
                  <dd className="mt-1 text-sm text-black/75">
                    {formatOrderReference(statusState.orderId)}
                  </dd>
                </div>
                <div>
                  <dt className="uppercase tracking-[0.22em] text-black/42">Status</dt>
                  <dd className="mt-1 text-sm text-black/75">
                    {formatPaymentStatus(statusState.paymentStatus)}
                  </dd>
                </div>
                {statusState.customerEmail ? (
                  <div>
                    <dt className="uppercase tracking-[0.22em] text-black/42">Email</dt>
                    <dd className="mt-1 break-words text-sm text-black/75">
                      {statusState.customerEmail}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="uppercase tracking-[0.22em] text-black/42">Total</dt>
                  <dd className="mt-1 text-sm text-black/75">
                    {typeof statusState.amountTotal === 'number'
                      ? formatCurrency(statusState.amountTotal, statusState.currency ?? 'USD')
                      : 'Recorded'}
                  </dd>
                </div>
              </dl>
            </div>

            {statusState.receiptItems.length > 0 ? (
              <div className="space-y-3 border-t border-black/10 pt-4">
                <p className="text-[0.62rem] uppercase tracking-[0.3em] text-black/52">Items</p>
                <ul className="space-y-4">
                  {statusState.receiptItems.map((item, index) => {
                    const itemDownloads = statusState.downloadLinks.filter(
                      (download) => download.productId === item.productId,
                    );

                    return (
                      <li
                        key={`${item.productId}-${index}`}
                        className="flex flex-col gap-3 border-b border-black/10 pb-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <CompactProductModel
                            productId={item.productId}
                            productName={item.productName}
                          />
                          <div className="min-w-0 space-y-2">
                            <div>
                              <p className="break-words text-sm uppercase tracking-[0.18em] text-black/75">
                                {item.productName}
                              </p>
                              <p className="text-xs text-black/55">Qty {item.quantity}</p>
                            </div>
                            {itemDownloads.length > 0 ? (
                              <div className="flex flex-wrap gap-3">
                                {itemDownloads.map((download) => (
                                  <a
                                    key={download.downloadUrl}
                                    href={download.downloadUrl}
                                    className="text-xs uppercase tracking-[0.3em] text-black/60"
                                  >
                                    Download
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <p className="shrink-0 text-xs text-black/60 sm:text-right">
                          {formatCurrency(
                            item.unitAmountCents * item.quantity,
                            statusState.currency ?? 'USD',
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {statusState.fulfillmentError ? (
              <p className="text-xs text-red-600">
                Email delivery hit an issue, but your download link is available here.
              </p>
            ) : null}
            <Link href="/store" className="text-xs uppercase tracking-[0.3em] text-black/60">
              Back to store
            </Link>
          </div>
        ) : null}

        {statusState.type === 'open' ? (
          <div className="space-y-4">
            <p>Checkout is still open.</p>
            <Link
              href={`/checkout?session_id=${encodeURIComponent(statusState.sessionId)}`}
              className="text-xs uppercase tracking-[0.3em] text-black/60"
            >
              Continue checkout
            </Link>
          </div>
        ) : null}

        {statusState.type === 'expired' ? (
          <div className="space-y-4">
            <p>This checkout session expired.</p>
            <Link href="/cart" className="text-xs uppercase tracking-[0.3em] text-black/60">
              Back to cart
            </Link>
          </div>
        ) : null}

        {statusState.type === 'error' ? (
          <div className="space-y-4">
            <p className="text-red-600">{statusState.message}</p>
            <Link href="/cart" className="text-xs uppercase tracking-[0.3em] text-black/60">
              Back to cart
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

const CheckoutReturnFallback = () => (
  <section className="space-y-10">
    <div className="showcase-transition-title text-center">
      <h1 className="text-3xl uppercase tracking-[0.3em]">Checkout status</h1>
    </div>
    <div className="showcase-transition-cards mx-auto w-full max-w-5xl rounded-2xl border border-black/10 bg-white/70 p-6 text-sm text-black/68 backdrop-blur-sm">
      Loading checkout status...
    </div>
  </section>
);

export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={<CheckoutReturnFallback />}>
      <CheckoutReturnContent />
    </Suspense>
  );
}
