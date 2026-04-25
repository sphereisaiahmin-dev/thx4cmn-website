import { StoreCarousel } from '@/components/StoreCarousel';
import { products } from '@/data/products';

export default function StorePage() {
  return (
    <section className="store-page w-full">
      <StoreCarousel products={products} />
    </section>
  );
}
