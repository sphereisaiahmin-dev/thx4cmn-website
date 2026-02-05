'use client';

import { useMemo } from 'react';
import Link from 'next/link';

import { formatCurrency } from '@/lib/format';
import { useCartStore } from '@/store/cart';
import { useUiStore } from '@/store/ui';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/store', label: 'Store' },
  { href: '/music', label: 'Music' },
  { href: '/device', label: 'Device' },
];

export const Navigation = () => {
  const items = useCartStore((state) => state.items);
  const isMiniCartOpen = useUiStore((state) => state.isMiniCartOpen);
  const setMiniCartOpen = useUiStore((state) => state.setMiniCartOpen);
  const totalQuantity = useMemo(
    () => items.reduce((total, item) => total + item.quantity, 0),
    [items],
  );
  const subtotal = useMemo(
    () => items.reduce((total, item) => total + item.priceCents * item.quantity, 0),
    [items],
  );

  return (
    <>
      <header className="flex items-center justify-between border-b border-black/10 py-6">
        <Link href="/" className="relative flex h-10 w-28 items-center justify-center overflow-visible">
          <span className="sr-only">thx4cmn</span>
          <iframe
            title="thx4cmn logo"
            src="https://thx4cmnlogo.netlify.app/"
            className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 border-0"
          />
        </Link>
        <nav className="flex items-center gap-6 text-xs uppercase tracking-[0.3em]">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            className="nav-link relative"
            aria-expanded={isMiniCartOpen}
            aria-controls="mini-cart"
            onClick={() => setMiniCartOpen(true)}
          >
            Cart
            {totalQuantity > 0 ? (
              <span className="absolute -right-4 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-black px-1 text-[0.6rem] font-semibold text-white">
                {totalQuantity}
              </span>
            ) : null}
          </button>
        </nav>
      </header>
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-200 ${
          isMiniCartOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!isMiniCartOpen}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${
            isMiniCartOpen ? 'opacity-100' : 'opacity-0'
          }`}
          aria-label="Close cart"
          onClick={() => setMiniCartOpen(false)}
        />
        <aside
          id="mini-cart"
          className={`absolute right-0 top-0 flex h-full w-full max-w-sm flex-col gap-6 border-l border-black/10 bg-white p-6 transition-transform duration-300 ${
            isMiniCartOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.3em]">Cart</p>
            <button
              type="button"
              className="text-xs uppercase tracking-[0.3em] text-black/60"
              onClick={() => setMiniCartOpen(false)}
            >
              Close
            </button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-black/60">Your cart is empty.</p>
          ) : (
            <ul className="flex flex-1 flex-col gap-4 overflow-auto pr-2">
              {items.map((item) => (
                <li key={item.productId} className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm">{item.name}</p>
                    <p className="text-xs text-black/60">Qty {item.quantity}</p>
                  </div>
                  <p className="text-xs text-black/60">
                    {formatCurrency(item.priceCents * item.quantity, item.currency)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-4 border-t border-black/10 pt-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em]">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <Link
              href="/cart"
              className="nav-link inline-flex w-full items-center justify-center border border-black px-4 py-3 text-xs uppercase tracking-[0.3em]"
              onClick={() => setMiniCartOpen(false)}
            >
              View cart
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
};
