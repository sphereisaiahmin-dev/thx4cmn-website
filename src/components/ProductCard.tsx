'use client';

import Link from 'next/link';

import { ProductModelScene } from '@/components/ProductModelScene';
import type { Product } from '@/data/products';
import { formatCurrency } from '@/lib/format';
import { useCartStore } from '@/store/cart';

interface ProductCardProps {
  product: Product;
}

const modelUrlsByProductId: Record<string, string> = {
  'sample-pack': '/api/3d/samplepack.glb',
  'midi-device': '/api/3d/thxc.glb',
};

export const ProductCard = ({ product }: ProductCardProps) => {
  const addItem = useCartStore((state) => state.addItem);
  const modelUrl = modelUrlsByProductId[product.id];

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
    <div className="flex h-full min-h-0 flex-col justify-between gap-4 border border-black/10 bg-black/5 p-4 md:gap-6 md:p-6">
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:gap-6">
        <div className="space-y-2 md:space-y-3">
          <h3 className="text-base uppercase tracking-[0.25em] md:text-lg">{product.name}</h3>
        </div>
        {modelUrl ? (
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white/70 p-2 md:p-3">
            <ProductModelScene modelUrl={modelUrl} className="h-full w-full" />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 md:gap-3">
        <span className="text-xs text-black/60 md:text-sm">
          {formatCurrency(product.priceCents)}
        </span>
        <div className="flex items-center gap-3 md:gap-4">
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
