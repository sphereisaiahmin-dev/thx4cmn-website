'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { modelUrlsByProductId } from '@/components/productModelUrls';
import type { Product } from '@/data/products';
import { normalizeCheckoutQuantity } from '@/lib/checkout';
import {
  getProductPriceLabel,
  getPurchaseActionLabel,
  isProductPurchasable,
} from '@/lib/productCommerce';
import { useCartStore } from '@/store/cart';

const ProductModelScene = dynamic(
  () => import('@/components/ProductModelScene').then((mod) => mod.ProductModelScene),
  {
    ssr: false,
  },
);

interface ProductDetailProps {
  product: Product;
}

export const ProductDetail = ({ product }: ProductDetailProps) => {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const [quantity, setQuantity] = useState(1);
  const modelUrl = modelUrlsByProductId[product.id];
  const isPurchasable = isProductPurchasable(product);

  const handleAdd = () => {
    if (!isPurchasable) return;
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
    <div className="grid grid-cols-1 gap-10 lg:min-h-[calc(100vh-var(--site-header-height)-var(--mobile-player-offset)-3.5rem)] lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)] lg:items-center lg:gap-16">
      <div className="min-h-0">
        {modelUrl ? (
          <div className="flex aspect-[6/5] w-full items-center justify-center lg:h-[min(82vh,960px)] lg:aspect-auto">
            <ProductModelScene
              modelUrl={modelUrl}
              className="h-full w-full"
              fitMode="detail-immersive"
              presentationScaleMultiplier={3.4}
            />
          </div>
        ) : (
          <div className="flex aspect-[6/5] w-full items-center justify-center text-sm text-black/50 lg:h-[min(82vh,960px)] lg:aspect-auto">
            3D preview unavailable.
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex h-full min-h-0 flex-col justify-center gap-8 lg:gap-11">
          <div className="space-y-5">
            <h1 className="break-words text-3xl uppercase tracking-[0.24em] md:text-5xl lg:text-[3.35rem]">
              {product.name}
            </h1>
            <p className="max-w-[38rem] break-words text-base leading-8 text-black/68 md:text-[1rem]">
              {product.description}
            </p>
            {product.contentsSummary ? (
              <p className="max-w-[38rem] text-sm leading-6 text-black/56">
                {product.contentsSummary}
              </p>
            ) : null}
          </div>

          <div className="space-y-6">
            <div>
              <p className="text-[0.62rem] uppercase tracking-[0.34em] text-black/42">Price</p>
              <p className="mt-2 text-2xl md:text-[2rem]">{getProductPriceLabel(product)}</p>
            </div>

            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2">
                <label
                  htmlFor="quantity"
                  className="text-[0.62rem] uppercase tracking-[0.34em] text-black/42"
                >
                  Qty
                </label>
                <input
                  id="quantity"
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  disabled={!isPurchasable}
                  onChange={(event) => {
                    const nextValue = normalizeCheckoutQuantity(
                      Number.parseInt(event.target.value, 10),
                    );
                    setQuantity(nextValue);
                  }}
                  className="w-24 rounded-full border border-black/18 bg-white/60 px-3 py-2 text-sm outline-none transition focus:border-black/32 disabled:cursor-not-allowed disabled:opacity-55"
                />
              </div>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!isPurchasable}
                className="add-to-cart-button inline-flex items-center justify-center self-start rounded-full px-6 py-3 text-xs uppercase tracking-[0.3em] transition duration-200 hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent sm:self-auto"
              >
                {getPurchaseActionLabel(product)}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
