'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { CHECKOUT_SESSION_STORAGE_KEY } from '@/lib/checkoutSessionStorage';
import { useCartStore } from '@/store/cart';

interface CheckoutSessionStatusPayload {
  id?: string;
  status?: 'open' | 'complete' | 'expired' | null;
  paymentStatus?: 'paid' | 'unpaid' | 'no_payment_required' | null;
  requestId?: string;
  error?: string;
}

type StatusState =
  | { type: 'loading' }
  | { type: 'complete'; paymentStatus: CheckoutSessionStatusPayload['paymentStatus'] }
  | { type: 'open'; sessionId: string }
  | { type: 'expired' }
  | { type: 'error'; message: string };

const clearStoredCheckoutSession = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
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
          setStatusState({ type: 'complete', paymentStatus: payload.paymentStatus ?? null });
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
                : 'Checkout received. Digital delivery items will be fulfilled by email.'}
            </p>
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
