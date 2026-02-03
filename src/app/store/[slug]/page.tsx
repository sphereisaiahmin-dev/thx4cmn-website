import Link from 'next/link';

import { ProductDetail } from '@/components/ProductDetail';
import { getProductBySlug } from '@/data/products';

interface ProductPageProps {
  params: { slug: string };
}

export default function ProductPage({ params }: ProductPageProps) {
  const product = getProductBySlug(params.slug);

  if (!product) {
    return (
      <section className="space-y-6">
        <h1 className="text-2xl uppercase tracking-[0.3em] text-slate-700">Product not found</h1>
        <Link href="/store" className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Back to store
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <Link href="/store" className="text-xs uppercase tracking-[0.3em] text-slate-400">
        ← Back to store
      </Link>
      <ProductDetail product={product} />
    </section>
  );
}
