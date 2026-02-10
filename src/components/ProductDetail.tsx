'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ProductModelScene } from '@/components/ProductModelScene';
import { modelUrlsByProductId } from '@/components/productModelUrls';
import type { Product } from '@/data/products';
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
      <div className="rounded-3xl border border-black/10 bg-black/5 p-4 md:p-6">
        {modelUrl ? (
          <div className="mx-auto flex aspect-[3/4] w-full max-w-[360px] flex-col rounded-2xl bg-white/70 p-2 md:max-w-[380px] md:p-3">
            <ProductModelScene modelUrl={modelUrl} className="h-full w-full" />
          </div>
        ) : (
          <div className="mx-auto flex aspect-[3/4] w-full max-w-[360px] items-center justify-center rounded-2xl bg-white/70 text-sm text-black/50 md:max-w-[380px]">
            3D preview unavailable.
          </div>
        )}
      </div>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-black/60">{product.type}</p>
          <h1 className="text-3xl uppercase tracking-[0.3em]">{product.name}</h1>
          <p className="text-sm text-black/70">{product.description}</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
          <p className="text-sm text-black/60">Price</p>
          <p className="text-2xl">{formatCurrency(product.priceCents, product.currency)}</p>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="quantity"
            className="text-xs uppercase tracking-[0.3em] text-black/60"
          >
            Quantity
          </label>
          <input
            id="quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={(event) => {
              const nextValue = Math.max(1, Number(event.target.value) || 1);
              setQuantity(nextValue);
            }}
            className="w-24 rounded-full border border-black/30 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="add-to-cart-button rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10"
        >
          Add to cart
        </button>
      </div>
    </div>
  );
};
