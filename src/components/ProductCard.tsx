'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { ProductModelScene } from '@/components/ProductModelScene';
import { modelUrlsByProductId } from '@/components/productModelUrls';
import type { Product } from '@/data/products';
import { formatCurrency } from '@/lib/format';
import { useCartStore } from '@/store/cart';

interface ProductCardProps {
  product: Product;
}

export const ProductCard = ({ product }: ProductCardProps) => {
  const addItem = useCartStore((state) => state.addItem);
  const modelUrl = modelUrlsByProductId[product.id];
  const modelContainerRef = useRef<HTMLDivElement | null>(null);
  const [isModelInView, setIsModelInView] = useState(false);
  const [hasActivatedModel, setHasActivatedModel] = useState(false);

  useEffect(() => {
    if (!modelUrl) return;
    const target = modelContainerRef.current;
    if (!target) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsModelInView(true);
      setHasActivatedModel(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries.some((entry) => entry.isIntersecting);
        setIsModelInView(isIntersecting);
        if (isIntersecting) {
          setHasActivatedModel(true);
        }
      },
      {
        rootMargin: '180px 0px',
        threshold: 0.2,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [modelUrl]);

  const handleAdd = () => {
    addItem({
      productId: product.id,
      name: product.name,
      priceCents: product.priceCents,
      currency: product.currency,
      quantity: 1,
      type: product.type,
    });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[520px] flex-col justify-center gap-4 rounded-[1.75rem] border border-black/10 bg-black/5 px-2 py-2 text-center md:min-h-[560px]">
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 md:gap-5">
        <div className="space-y-2">
          <h3 className="text-base uppercase tracking-[0.25em] md:text-lg">{product.name}</h3>
        </div>
        {modelUrl ? (
          <div
            ref={modelContainerRef}
            className="flex w-full items-center justify-center rounded-2xl border border-black/10 bg-white"
          >
            {hasActivatedModel ? (
              <ProductModelScene
                modelUrl={modelUrl}
                className="aspect-square h-auto min-h-[280px] w-full max-w-[440px] md:min-h-[340px] md:max-w-[500px]"
                isActive={isModelInView}
                performanceMode="constrained"
              />
            ) : (
              <div className="flex aspect-square h-auto min-h-[280px] w-full max-w-[440px] items-center justify-center text-xs uppercase tracking-[0.2em] text-black/50 md:min-h-[340px] md:max-w-[500px]">
                3D preview loads on view
              </div>
            )}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs text-black/60 md:text-sm">
          {formatCurrency(product.priceCents)}
        </span>
        <div className="flex items-center justify-center gap-3 md:gap-4">
          <button
            type="button"
            onClick={handleAdd}
            className="add-to-cart-button rounded-full border border-black/30 px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.3em] transition hover:bg-black/10 md:px-4 md:py-2 md:text-xs"
          >
            Add to cart
          </button>
          <Link
            href={`/store/${product.slug}`}
            className="text-[0.65rem] uppercase tracking-[0.3em] text-black/60 md:text-xs"
          >
            Details
          </Link>
        </div>
      </div>
    </div>
  );
};
