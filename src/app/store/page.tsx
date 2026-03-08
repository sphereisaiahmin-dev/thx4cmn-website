import { ProductCard } from '@/components/ProductCard';
import { products } from '@/data/products';

export default function StorePage() {
  return (
    <section className="store-page md:flex md:min-h-[calc(100vh-var(--site-header-height)-8rem)] md:items-center">
      <div className="mx-auto flex w-full max-w-[1120px] justify-center">
        <div className="grid w-full grid-cols-1 gap-10 md:grid-cols-2 md:items-center md:gap-12">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
        </div>
      </div>
    </section>
  );
}
