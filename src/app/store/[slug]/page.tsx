import Link from 'next/link';

import { ProductDetail } from '@/components/ProductDetail';
import { getReleasedProductBySlug } from '@/data/products';

type Awaitable<T> = T | Promise<T>;

interface ProductPageProps {
  params: Awaitable<{ slug: string }>;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = getReleasedProductBySlug(slug);

  if (!product) {
    return (
      <section className="store-page w-full">
        <div className="mx-auto flex w-full max-w-[min(1700px,100%)] flex-col gap-6 px-1 md:px-4 xl:px-8">
          <h1 className="text-2xl uppercase tracking-[0.3em]">Product not found</h1>
          <Link href="/store" className="text-xs uppercase tracking-[0.3em] text-black/60">
            Back to store
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="store-page w-full md:-mx-6 md:-mt-8 md:-mb-10">
      <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-8 px-6 md:px-10 xl:px-14">
        <Link href="/store" className="text-xs uppercase tracking-[0.3em] text-black/60">
          &larr; Back to store
        </Link>
        <ProductDetail product={product} />
      </div>
    </section>
  );
}
