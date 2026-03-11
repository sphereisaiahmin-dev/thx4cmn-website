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
      <section className="store-page">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
          <h1 className="text-2xl uppercase tracking-[0.3em]">Product not found</h1>
          <Link href="/store" className="text-xs uppercase tracking-[0.3em] text-black/60">
            Back to store
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="store-page">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8">
        <Link href="/store" className="text-xs uppercase tracking-[0.3em] text-black/60">
          ← Back to store
        </Link>
        <ProductDetail product={product} />
      </div>
    </section>
  );
}
