'use client';

import { useRouter } from 'next/navigation';

import type { Product } from '@/data/products';
import { formatCurrency } from '@/lib/format';
import { useCartStore } from '@/store/cart';

interface ProductDetailProps {
  product: Product;
}

export const ProductDetail = ({ product }: ProductDetailProps) => {
  const router = useRouter();
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
    router.push('/cart');
  };

  return (
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
      <button
        type="button"
        onClick={handleAdd}
        className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10"
      >
        Add to cart
      </button>
    </div>
  );
};
