'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import {
  isValidCheckoutEmail,
  normalizeCheckoutEmail,
  normalizeCheckoutQuantity,
  toCheckoutItemsPayload,
} from '@/lib/checkout';
import { CHECKOUT_SESSION_STORAGE_KEY } from '@/lib/checkoutSessionStorage';
import {
  cartRequiresEmailCapture,
  getCartItemDeliveryNote,
  getCartItemPriceLabel,
  getCartPrimaryActionLabel,
  getProductTotalLabel,
} from '@/lib/productCommerce';
import { useCartStore } from '@/store/cart';

function CartPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clear = useCartStore((state) => state.clear);
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState('');
  const handledSuccessRef = useRef(false);
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
    [items],
  );
  const cartCurrency = items[0]?.currency ?? 'USD';
  const requiresEmailCapture = cartRequiresEmailCapture(items);
  const checkoutStatus = searchParams.get('checkout');
  const checkoutMode = searchParams.get('mode');
  const showSuccess = checkoutStatus === 'success';
  const showCanceled = checkoutStatus === 'cancel';
  const successMessage =
    checkoutMode === 'free-claim'
      ? 'Claim received. Digital delivery is queued for email fulfillment.'
      : 'Checkout received. Digital delivery items will be fulfilled by email.';
  const primaryActionLabel = getCartPrimaryActionLabel(items);

  useEffect(() => {
    if (!showSuccess || handledSuccessRef.current) return;
    handledSuccessRef.current = true;
    clear();
    setCheckoutError(null);
    setIsLoading(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
    }
  }, [clear, showSuccess]);

  useEffect(() => {
    if (items.length > 0) return;
    setCheckoutError(null);
    setIsLoading(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
    }
  }, [items.length]);

  const handleCheckout = async () => {
    if (isLoading || items.length === 0) return;
    setCheckoutError(null);
    if (requiresEmailCapture && !isValidCheckoutEmail(contactEmail)) {
      setCheckoutError('Enter a valid email to claim free digital items.');
      return;
    }

    if (!requiresEmailCapture) {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
      }
      router.push('/checkout');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: toCheckoutItemsPayload(
            items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          ),
          email: requiresEmailCapture ? normalizeCheckoutEmail(contactEmail) : undefined,
        }),
      });

      if (!response.ok) {
        let errorPayload: { error?: string; requestId?: string } | null = null;
        try {
          errorPayload = (await response.json()) as { error?: string; requestId?: string };
        } catch (parseError) {
          console.error('Failed to parse checkout error response.', parseError);
        }
        const message = errorPayload?.error ?? 'Checkout failed';
        const requestId = errorPayload?.requestId ? ` (requestId: ${errorPayload.requestId})` : '';
        throw new Error(`${message}${requestId}`);
      }

      const payload = (await response.json()) as {
        url?: string;
        requestId?: string;
        persistCheckoutUrl?: boolean;
      };
      const checkoutUrl = typeof payload.url === 'string' ? payload.url : '';
      if (!checkoutUrl) {
        const requestId = payload.requestId ? ` (requestId: ${payload.requestId})` : '';
        throw new Error(`Checkout session did not return a URL.${requestId}`);
      }

      window.location.href = checkoutUrl;
    } catch (error) {
      console.error(error);
      setCheckoutError(error instanceof Error ? error.message : 'Unable to start checkout.');
      setIsLoading(false);
    }
  };

  return (
    <section className="space-y-10">
      <div className="showcase-transition-title text-center">
        <h1 className="text-3xl uppercase tracking-[0.3em]">Cart</h1>
      </div>

      {showSuccess ? (
        <div className="mx-auto w-full max-w-5xl rounded-2xl border border-black/10 bg-white/65 px-6 py-4 text-sm text-black/68 backdrop-blur-sm">
          {successMessage}
        </div>
      ) : null}

      {showCanceled ? (
        <div className="mx-auto w-full max-w-5xl rounded-2xl border border-black/10 bg-white/65 px-6 py-4 text-sm text-black/68 backdrop-blur-sm">
          Checkout was canceled. Your cart is still here.
        </div>
      ) : null}

      <div className="showcase-transition-cards max-h-[60vh] w-full overflow-y-auto rounded-2xl border border-black/10 bg-black/5 p-6 lg:mx-auto lg:max-w-5xl">
        {items.length === 0 ? (
          <p className="text-sm text-black/60">Your cart is empty.</p>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.productId}
                  className="flex flex-col gap-4 border border-black/10 bg-black/5 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em]">{item.name}</p>
                    <p className="text-xs text-black/60">{getCartItemPriceLabel(item)}</p>
                    {getCartItemDeliveryNote(item) ? (
                      <p className="mt-1 text-[0.62rem] uppercase tracking-[0.22em] text-black/45">
                        {getCartItemDeliveryNote(item)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={item.quantity}
                      onChange={(event) => {
                        const nextQuantity = normalizeCheckoutQuantity(
                          Number.parseInt(event.target.value, 10),
                        );
                        updateQuantity(item.productId, nextQuantity);
                      }}
                      className="w-20 rounded-md bg-black/10 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      className="text-xs uppercase tracking-[0.3em] text-black/60"
                      onClick={() => removeItem(item.productId)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-4 border border-black/10 bg-black/5 p-6">
              <div className="flex items-center justify-between text-sm uppercase tracking-[0.2em]">
                <span>Total</span>
                <span>
                  {getProductTotalLabel({ priceCents: total, quantity: 1, currency: cartCurrency })}
                </span>
              </div>
              {requiresEmailCapture ? (
                <div className="space-y-2">
                  <label
                    htmlFor="checkout-email"
                    className="text-[0.62rem] uppercase tracking-[0.3em] text-black/52"
                  >
                    Fulfillment email
                  </label>
                  <input
                    id="checkout-email"
                    type="email"
                    autoComplete="email"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    placeholder="name@example.com"
                    className="w-full rounded-full border border-black/18 bg-white/70 px-4 py-3 text-sm outline-none transition focus:border-black/32"
                  />
                  <p className="text-xs text-black/56">
                    Free digital items are claimed here and fulfilled by email.
                  </p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={isLoading}
                  className="device-connect-hover-cycle rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? 'Redirecting...' : primaryActionLabel}
                </button>
                <button
                  type="button"
                  onClick={clear}
                  className="text-xs uppercase tracking-[0.3em] text-black/60"
                >
                  Clear cart
                </button>
              </div>
              {checkoutError ? <p className="text-xs text-red-600">{checkoutError}</p> : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const CartPageFallback = () => (
  <section className="space-y-10">
    <div className="showcase-transition-title text-center">
      <h1 className="text-3xl uppercase tracking-[0.3em]">Cart</h1>
    </div>
    <div className="showcase-transition-cards max-h-[60vh] w-full overflow-y-auto rounded-2xl border border-black/10 bg-black/5 p-6 lg:mx-auto lg:max-w-5xl">
      <p className="text-sm text-black/60">Loading cart...</p>
    </div>
  </section>
);

export default function CartPage() {
  return (
    <Suspense fallback={<CartPageFallback />}>
      <CartPageContent />
    </Suspense>
  );
}
