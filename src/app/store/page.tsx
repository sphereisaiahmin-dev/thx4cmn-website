import { ProductCard } from '@/components/ProductCard';
import { products } from '@/data/products';

export default function StorePage() {
  return (
    <section className="store-page space-y-10">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-black/60">Store</p>
        <h1 className="text-3xl uppercase tracking-[0.3em]">Latest drops</h1>
        <p className="max-w-xl text-sm text-black/70">
          Limited releases from thx4cmn. Digital packs deliver instantly. Physical hardware
          ships with custom LED and chord maps.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
