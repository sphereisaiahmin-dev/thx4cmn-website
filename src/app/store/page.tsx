import { ProductCard } from '@/components/ProductCard';
import { products } from '@/data/products';

export default function StorePage() {
  return (
    <section className="store-page">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-10">
        <div className="showcase-transition-title text-center">
          <h1 className="text-3xl uppercase tracking-[0.3em]">Store</h1>
        </div>
        <div className="showcase-transition-cards grid w-full grid-cols-1 gap-10 md:grid-cols-2 md:items-center md:gap-12">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
