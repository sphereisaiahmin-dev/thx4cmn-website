import Link from 'next/link';

import { ProductDetail } from '@/components/ProductDetail';
import { getReleasedProductBySlug } from '@/data/products';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = getReleasedProductBySlug(slug);

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
      <div className="mx-auto flex w-full max-w-[1580px] flex-col gap-8 px-2 md:px-4">
        <Link href="/store" className="text-xs uppercase tracking-[0.3em] text-black/60">
          &larr; Back to store
        </Link>
        <ProductDetail product={product} />
      </div>
    </section>
  );
}
