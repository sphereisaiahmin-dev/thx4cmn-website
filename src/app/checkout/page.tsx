'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CheckoutElementsProvider,
  ContactDetailsElement,
  PaymentElement,
  useCheckoutElements,
} from '@stripe/react-stripe-js/checkout';
import { loadStripe } from '@stripe/stripe-js';

import { CompactProductModel } from '@/components/CompactProductModel';
import { toCheckoutItemsPayload } from '@/lib/checkout';
import { CHECKOUT_SESSION_STORAGE_KEY } from '@/lib/checkoutSessionStorage';
import { getCartItemDeliveryNote, getProductTotalLabel } from '@/lib/productCommerce';
import { useCartStore } from '@/store/cart';

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;
const CHECKOUT_SESSION_TTL_MS = 60 * 60 * 1000;

interface CheckoutSessionPayload {
  clientSecret?: string | null;
  sessionId?: string;
  id?: string;
  status?: 'open' | 'complete' | 'expired' | null;
  url?: string;
  requestId?: string;
  error?: string;
}

interface StoredCheckoutSession {
  cartSignature: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
}

const isStoredCheckoutSessionExpired = (storedSession: Partial<StoredCheckoutSession>) => {
  const timestamp = storedSession.updatedAt ?? storedSession.createdAt;
  return (
    typeof timestamp !== 'number' ||
    !Number.isFinite(timestamp) ||
    Date.now() - timestamp > CHECKOUT_SESSION_TTL_MS
  );
};

type CheckoutSetupState =
  | { type: 'loading'; message: string }
  | { type: 'ready'; clientSecret: string; sessionId: string }
  | { type: 'empty' }
  | { type: 'error'; message: string };

const readStoredCheckoutSession = (cartSignature: string) => {
  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.localStorage.getItem(CHECKOUT_SESSION_STORAGE_KEY);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue) as Partial<StoredCheckoutSession>;
    if (isStoredCheckoutSessionExpired(parsed)) {
      window.localStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
      return null;
    }

    if (parsed.cartSignature !== cartSignature || !parsed.sessionId) {
      return null;
    }

    return parsed.sessionId;
  } catch {
    return null;
  }
};

const writeStoredCheckoutSession = (cartSignature: string, sessionId: string) => {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  window.localStorage.setItem(
    CHECKOUT_SESSION_STORAGE_KEY,
    JSON.stringify({
      cartSignature,
      sessionId,
      createdAt: now,
      updatedAt: now,
    } satisfies StoredCheckoutSession),
  );
};

const clearStoredCheckoutSession = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
};

const parseCheckoutResponse = async (response: Response) => {
  const payload = (await response.json().catch(() => null)) as CheckoutSessionPayload | null;
  if (!response.ok) {
    const message = payload?.error ?? 'Checkout failed.';
    const requestId = payload?.requestId ? ` (requestId: ${payload.requestId})` : '';
    throw new Error(`${message}${requestId}`);
  }

  return payload ?? {};
};

function CheckoutElementsForm({
  sessionId,
  totalLabel,
  onComplete,
}: {
  sessionId: string;
  totalLabel: string;
  onComplete: (sessionId: string) => void;
}) {
  const checkoutState = useCheckoutElements();
  const [isConfirming, setIsConfirming] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (checkoutState.type !== 'success' || isConfirming) return;

    setCheckoutError(null);
    setIsConfirming(true);
    try {
      const result = await checkoutState.checkout.confirm({
        redirect: 'if_required',
      });

      if (result.type === 'error') {
        throw new Error(result.error.message);
      }

      onComplete(result.session.id ?? sessionId);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Unable to confirm checkout.');
      setIsConfirming(false);
    }
  };

  if (checkoutState.type === 'loading') {
    return <p className="text-sm text-black/60">Loading checkout...</p>;
  }

  if (checkoutState.type === 'error') {
    return <p className="text-sm text-red-600">{checkoutState.error.message}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <p className="text-[0.62rem] uppercase tracking-[0.3em] text-black/52">Contact</p>
        <ContactDetailsElement />
      </div>
      <div className="space-y-3">
        <p className="text-[0.62rem] uppercase tracking-[0.3em] text-black/52">Payment</p>
        <PaymentElement />
      </div>
      <button
        type="submit"
        disabled={isConfirming}
        className="device-connect-hover-cycle inline-flex w-full items-center justify-center rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isConfirming ? 'Confirming...' : `Confirm ${totalLabel}`}
      </button>
      {checkoutError ? <p className="text-xs text-red-600">{checkoutError}</p> : null}
    </form>
  );
}

function CheckoutPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const items = useCartStore((state) => state.items);
  const clear = useCartStore((state) => state.clear);
  const [setupState, setSetupState] = useState<CheckoutSetupState>({
    type: 'loading',
    message: 'Preparing checkout...',
  });
  const sessionIdParam = searchParams.get('session_id')?.trim() ?? '';
  const checkoutItems = useMemo(
    () =>
      toCheckoutItemsPayload(
        items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      ),
    [items],
  );
  const cartSignature = useMemo(() => JSON.stringify(checkoutItems), [checkoutItems]);
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
    [items],
  );
  const cartCurrency = items[0]?.currency ?? 'USD';
  const totalLabel = getProductTotalLabel({
    priceCents: total,
    quantity: 1,
    currency: cartCurrency,
  });

  const loadExistingSession = useCallback(async (sessionId: string, signal: AbortSignal) => {
    const response = await fetch(
      `/api/stripe/session?session_id=${encodeURIComponent(sessionId)}`,
      { signal },
    );
    const payload = await parseCheckoutResponse(response);
    return {
      status: payload.status,
      clientSecret: payload.clientSecret ?? null,
      sessionId: payload.id ?? sessionId,
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const prepareCheckout = async () => {
      if (!stripePublishableKey || !stripePromise) {
        setSetupState({
          type: 'error',
          message: 'Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.',
        });
        return;
      }

      if (sessionIdParam) {
        setSetupState({ type: 'loading', message: 'Loading checkout session...' });
        try {
          const existingSession = await loadExistingSession(sessionIdParam, controller.signal);
          if (controller.signal.aborted) return;

          if (existingSession.status === 'open' && existingSession.clientSecret) {
            setSetupState({
              type: 'ready',
              clientSecret: existingSession.clientSecret,
              sessionId: existingSession.sessionId,
            });
            return;
          }

          router.replace(
            `/checkout/return?session_id=${encodeURIComponent(existingSession.sessionId)}`,
          );
        } catch (error) {
          if (controller.signal.aborted) return;
          setSetupState({
            type: 'error',
            message: error instanceof Error ? error.message : 'Unable to load checkout session.',
          });
        }
        return;
      }

      if (checkoutItems.length === 0) {
        setSetupState({ type: 'empty' });
        return;
      }

      const storedSessionId = readStoredCheckoutSession(cartSignature);
      if (storedSessionId) {
        setSetupState({ type: 'loading', message: 'Resuming checkout...' });
        try {
          const storedSession = await loadExistingSession(storedSessionId, controller.signal);
          if (controller.signal.aborted) return;

          if (storedSession.status === 'open' && storedSession.clientSecret) {
            setSetupState({
              type: 'ready',
              clientSecret: storedSession.clientSecret,
              sessionId: storedSession.sessionId,
            });
            return;
          }

          clearStoredCheckoutSession();
        } catch {
          if (controller.signal.aborted) return;
          clearStoredCheckoutSession();
        }
      }

      setSetupState({ type: 'loading', message: 'Creating checkout session...' });
      try {
        const response = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: checkoutItems }),
          signal: controller.signal,
        });
        const payload = await parseCheckoutResponse(response);
        if (controller.signal.aborted) return;

        if (payload.url) {
          window.location.href = payload.url;
          return;
        }

        if (!payload.clientSecret || !payload.sessionId) {
          throw new Error('Checkout session did not return a client secret.');
        }

        writeStoredCheckoutSession(cartSignature, payload.sessionId);
        setSetupState({
          type: 'ready',
          clientSecret: payload.clientSecret,
          sessionId: payload.sessionId,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setSetupState({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unable to start checkout.',
        });
      }
    };

    void prepareCheckout();
    return () => controller.abort();
  }, [cartSignature, checkoutItems, loadExistingSession, router, sessionIdParam]);

  const handleComplete = (completedSessionId: string) => {
    clear();
    clearStoredCheckoutSession();
    router.push(`/checkout/return?session_id=${encodeURIComponent(completedSessionId)}`);
  };

  const checkoutOptions = useMemo(
    () =>
      setupState.type === 'ready'
        ? {
            clientSecret: setupState.clientSecret,
            elementsOptions: {
              appearance: {
                variables: {
                  colorPrimary: '#111111',
                  colorText: '#111111',
                  colorTextSecondary: '#5f5a52',
                  colorBackground: '#fffaf0',
                  colorDanger: '#b91c1c',
                  borderRadius: '8px',
                  fontFamily: 'Inter, system-ui, sans-serif',
                },
              },
            },
          }
        : null,
    [setupState],
  );

  return (
    <section className="space-y-10">
      <div className="showcase-transition-title text-center">
        <h1 className="text-3xl uppercase tracking-[0.3em]">Checkout</h1>
      </div>

      <div className="showcase-transition-cards grid w-full gap-6 lg:mx-auto lg:max-w-6xl lg:grid-cols-[minmax(0,0.88fr)_minmax(24rem,1.12fr)]">
        <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
          <div className="flex items-center justify-between gap-4 border-b border-black/10 pb-4 text-xs uppercase tracking-[0.3em]">
            <span>Order</span>
            <span>{totalLabel}</span>
          </div>
          {items.length === 0 ? (
            <p className="pt-6 text-sm text-black/60">Your cart is empty.</p>
          ) : (
            <ul className="space-y-4 pt-6">
              {items.map((item) => (
                <li
                  key={item.productId}
                  className="flex items-start justify-between gap-4 border-b border-black/10 pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <CompactProductModel productId={item.productId} productName={item.name} />
                    <div className="min-w-0 space-y-1">
                      <p className="break-words text-sm uppercase tracking-[0.18em]">
                        {item.name}
                      </p>
                      <p className="text-xs text-black/60">Qty {item.quantity}</p>
                      {getCartItemDeliveryNote(item) ? (
                        <p className="text-[0.6rem] uppercase tracking-[0.2em] text-black/45">
                          {getCartItemDeliveryNote(item)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <p className="shrink-0 text-right text-xs text-black/60">
                    {getProductTotalLabel(item)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/70 p-6 backdrop-blur-sm">
          {setupState.type === 'loading' ? (
            <p className="text-sm text-black/60">{setupState.message}</p>
          ) : null}

          {setupState.type === 'empty' ? (
            <div className="space-y-4">
              <p className="text-sm text-black/60">Your cart is empty.</p>
              <Link href="/store" className="text-xs uppercase tracking-[0.3em] text-black/60">
                Back to store
              </Link>
            </div>
          ) : null}

          {setupState.type === 'error' ? (
            <div className="space-y-4">
              <p className="text-sm text-red-600">{setupState.message}</p>
              <Link href="/cart" className="text-xs uppercase tracking-[0.3em] text-black/60">
                Back to cart
              </Link>
            </div>
          ) : null}

          {setupState.type === 'ready' && checkoutOptions ? (
            <CheckoutElementsProvider stripe={stripePromise} options={checkoutOptions}>
              <CheckoutElementsForm
                sessionId={setupState.sessionId}
                totalLabel={totalLabel}
                onComplete={handleComplete}
              />
            </CheckoutElementsProvider>
          ) : null}
        </div>
      </div>
    </section>
  );
}

const CheckoutPageFallback = () => (
  <section className="space-y-10">
    <div className="showcase-transition-title text-center">
      <h1 className="text-3xl uppercase tracking-[0.3em]">Checkout</h1>
    </div>
    <div className="showcase-transition-cards mx-auto w-full max-w-5xl rounded-2xl border border-black/10 bg-black/5 p-6">
      <p className="text-sm text-black/60">Loading checkout...</p>
    </div>
  </section>
);

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutPageFallback />}>
      <CheckoutPageContent />
    </Suspense>
  );
}
