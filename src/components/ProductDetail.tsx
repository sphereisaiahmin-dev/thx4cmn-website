'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ProductModelScene } from '@/components/ProductModelScene';
import { modelUrlsByProductId } from '@/components/productModelUrls';
import type { Product } from '@/data/products';
import { normalizeCheckoutQuantity } from '@/lib/checkout';
import { formatCurrency } from '@/lib/format';
import { useCartStore } from '@/store/cart';

interface ProductDetailProps {
  product: Product;
}

export const ProductDetail = ({ product }: ProductDetailProps) => {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const [quantity, setQuantity] = useState(1);
  const modelUrl = modelUrlsByProductId[product.id];
  const typeLabel = product.type === 'digital' ? 'Digital download' : 'Hardware';

  const handleAdd = () => {
    addItem({
      productId: product.id,
      name: product.name,
      priceCents: product.priceCents,
      currency: product.currency,
      quantity,
      type: product.type,
    });
    router.push('/cart');
  };

  return (
    <div
      className="relative w-full"
      style={{ height: 'calc(100vh - var(--site-header-height) - var(--mobile-player-offset))' }}
    >
      {/* ── 3D canvas — fills the entire region ── */}
      {modelUrl ? (
        <ProductModelScene
          modelUrl={modelUrl}
          className="absolute inset-0 h-full w-full"
          fitMode="detail-fill"
        />
      ) : (
        <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-xs text-black/40">
          3D preview unavailable.
        </p>
      )}

      {/* ── Edge vignette — blends canvas into page background ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 85% at 50% 42%, transparent 48%, rgba(255,255,255,0.92) 100%)',
        }}
      />

      {/* ── Back link — floating top-left ── */}
      <Link
        href="/store"
        className="absolute left-5 top-5 z-10 text-[0.62rem] uppercase tracking-[0.34em] text-black/52 transition duration-200 hover:text-black"
      >
        ← Back
      </Link>

      {/* ── Description overlay — bottom-center, fades over the 3D scene ── */}
      <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-center md:bottom-10">
        <div className="inline-flex flex-col items-center gap-3 px-7 py-4 md:gap-4 md:px-9 md:py-5">

          {/* Type + Name */}
          <div>
            <p className="text-[0.55rem] uppercase tracking-[0.44em] text-black/40">
              {typeLabel}
            </p>
            <h1 className="mt-0.5 text-base uppercase tracking-[0.22em] md:text-lg">
              {product.name}
            </h1>
          </div>

          {/* Description */}
          <p className="line-clamp-3 max-w-xs text-[0.65rem] leading-relaxed text-black/55 md:max-w-sm">
            {product.description}
          </p>

          {/* Price */}
          <p className="text-[0.7rem] uppercase tracking-[0.34em] text-black/60">
            {formatCurrency(product.priceCents, product.currency)}
          </p>

          {/* Qty + Add to cart */}
          <div className="pointer-events-auto flex items-center gap-4 md:gap-5">
            <div className="flex items-center gap-2">
              <label
                htmlFor="quantity"
                className="text-[0.55rem] uppercase tracking-[0.34em] text-black/40"
              >
                Qty
              </label>
              <input
                id="quantity"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => {
                  const nextValue = normalizeCheckoutQuantity(
                    Number.parseInt(event.target.value, 10),
                  );
                  setQuantity(nextValue);
                }}
                className="w-14 rounded-full border border-black/30 bg-white/60 px-2.5 py-1 text-xs backdrop-blur-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleAdd}
              className="add-to-cart-button rounded-full px-4 py-1.5 text-[0.62rem] uppercase tracking-[0.34em] transition duration-200 hover:bg-white/65 md:px-5"
            >
              Add to cart
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
