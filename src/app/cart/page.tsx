'use client';

import { useMemo, useState } from 'react';

import { formatCurrency } from '@/lib/format';
import { useCartStore } from '@/store/cart';

export default function CartPage() {
  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clear = useCartStore((state) => state.clear);
  const [isLoading, setIsLoading] = useState(false);
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
    [items],
  );

  const handleCheckout = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
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

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error(error);
      setIsLoading(false);
    }
  };

  return (
    <section className="space-y-10">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-black/60">Cart</p>
        <h1 className="text-3xl uppercase tracking-[0.3em]">Your selections</h1>
      </div>

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
                  <p className="text-xs text-black/60">{formatCurrency(item.priceCents)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(event) => {
                      const nextQuantity = Number(event.target.value);
                      updateQuantity(
                        item.productId,
                        Number.isFinite(nextQuantity) && nextQuantity > 0 ? nextQuantity : 1,
                      );
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
              <span>{formatCurrency(total)}</span>
            </div>
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={handleCheckout}
                disabled={isLoading}
                className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? 'Redirecting…' : 'Checkout'}
              </button>
              <button
                type="button"
                onClick={clear}
                className="text-xs uppercase tracking-[0.3em] text-black/60"
              >
                Clear cart
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
