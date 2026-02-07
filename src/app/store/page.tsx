import { ProductCard } from '@/components/ProductCard';
import { products } from '@/data/products';

export default function StorePage() {
  return (
    <section className="store-page h-dvh overflow-hidden">
      <div className="grid h-full grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
