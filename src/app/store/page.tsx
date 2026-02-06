import { ProductCard } from '@/components/ProductCard';
import { products } from '@/data/products';

export default function StorePage() {
  return (
    <section className="store-page h-screen">
      <div className="grid h-full grid-cols-1 md:grid-cols-2">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
