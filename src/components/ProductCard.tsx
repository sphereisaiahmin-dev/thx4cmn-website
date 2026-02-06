'use client';

import Link from 'next/link';

import type { Product } from '@/data/products';
import { formatCurrency } from '@/lib/format';
import { useCartStore } from '@/store/cart';

interface ProductCardProps {
  product: Product;
}

export const ProductCard = ({ product }: ProductCardProps) => {
  const addItem = useCartStore((state) => state.addItem);

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
    <div className="flex h-full flex-col justify-between gap-6 rounded-2xl border border-black/10 bg-black/5 p-6">
      <div className="space-y-3">
        <h3 className="text-lg uppercase tracking-[0.25em]">{product.name}</h3>
        <p className="text-sm text-black/70">{product.description}</p>
      </div>
      <div className="flex flex-col gap-3">
        <span className="text-sm text-black/60">{formatCurrency(product.priceCents)}</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleAdd}
            className="add-to-cart-button rounded-full border border-black/30 px-4 py-2 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10"
          >
            Add to cart
          </button>
          <Link
            href={`/store/${product.slug}`}
            className="text-xs uppercase tracking-[0.3em] text-black/60"
          >
            Details
          </Link>
        </div>
      </div>
    </div>
  );
};
