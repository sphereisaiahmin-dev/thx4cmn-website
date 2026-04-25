import { StoreCarousel } from '@/components/StoreCarousel';
import { products } from '@/data/products';

export default function StorePage() {
  return (
    <section className="store-page w-full md:-mx-6 md:-mt-16 md:-mb-16">
      <StoreCarousel products={products} />
    </section>
  );
}
