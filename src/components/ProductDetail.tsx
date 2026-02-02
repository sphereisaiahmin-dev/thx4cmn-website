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
        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">{product.type}</p>
        <h1 className="text-3xl uppercase tracking-[0.3em] text-slate-700">{product.name}</h1>
        <p className="text-sm text-slate-500">{product.description}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <p className="text-sm text-slate-400">Price</p>
        <p className="text-2xl">{formatCurrency(product.priceCents, product.currency)}</p>
      </div>
      <button
        type="button"
        onClick={handleAdd}
        className="rounded-full border border-slate-300 px-6 py-3 text-xs uppercase tracking-[0.3em] text-slate-600 transition hover:border-slate-400 hover:bg-slate-900 hover:text-white"
      >
        Add to cart
      </button>
    </div>
  );
};
