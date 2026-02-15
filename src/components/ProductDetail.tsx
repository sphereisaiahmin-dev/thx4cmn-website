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
  const typeLabel = product.type === 'digital' ? '(digital)' : '(hardware)';

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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch lg:gap-8">
      <div className="lg:col-span-6">
        <div className="h-full rounded-3xl border border-black/10 bg-black/5 p-3 md:p-4">
          {modelUrl ? (
            <div className="flex aspect-[4/5] w-full items-center justify-center rounded-2xl bg-white/70 p-3 md:p-4 lg:h-[560px] lg:aspect-auto">
              <ProductModelScene modelUrl={modelUrl} className="h-full w-full" fitMode="detail-fill" />
            </div>
          ) : (
            <div className="flex aspect-[4/5] w-full items-center justify-center rounded-2xl bg-white/70 p-3 text-sm text-black/50 md:p-4 lg:h-[560px] lg:aspect-auto">
              3D preview unavailable.
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0 space-y-5 lg:col-span-6 lg:space-y-6">
        <div className="min-w-0 rounded-2xl border border-black/10 bg-black/5 p-5 md:p-6">
          <p className="text-xs uppercase tracking-[0.4em] text-black/60">{typeLabel}</p>
          <h1 className="mt-2 break-words text-3xl uppercase tracking-[0.3em] md:text-4xl">
            {product.name}
          </h1>
          <p className="mt-3 break-words text-sm text-black/70">{product.description}</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-black/5 p-5 md:p-6">
          <div className="space-y-5">
            <div>
              <p className="text-sm text-black/60">Price</p>
              <p className="text-2xl">{formatCurrency(product.priceCents, product.currency)}</p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2">
                <label
                  htmlFor="quantity"
                  className="text-xs uppercase tracking-[0.3em] text-black/60"
                >
                  Qty
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
                className="add-to-cart-button inline-flex items-center justify-center rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition duration-200 hover:bg-black/10"
              >
                Add to cart
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
