export type ProductType = 'digital' | 'physical';
export type ProductDeliveryMethod = 'email';

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: ProductType;
  isReleased: boolean;
  priceCents: number;
  currency: string;
  stripePriceId?: string;
  r2Key?: string | null;
  deliveryMethod?: ProductDeliveryMethod;
}

export const products: Product[] = [
  {
    id: 'sample-pack',
    slug: 'sample-pack',
    name: 'Community Vol. 1',
    description:
      'Downloadable sample pack with curated drum, texture, and instrument sounds from the lab.',
    type: 'digital',
    isReleased: true,
    priceCents: 0,
    currency: 'USD',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_COMMUNITY_PACK,
    r2Key: 'packs/Community Vol. 1-20260605T024044Z-3-001.zip',
    deliveryMethod: 'email',
  },
  {
    id: 'universe-vol-1',
    slug: 'universe-vol-1',
    name: 'Universe Vol. 1',
    description:
      'Downloadable melody pack with spaced-out keys, cosmic textures, and celestial loops built for wide, atmospheric ideas.',
    type: 'digital',
    isReleased: true,
    priceCents: 3000,
    currency: 'USD',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_UNIVERSE_PACK,
    r2Key: 'packs/Community Vol. 1-20260605T024044Z-3-001.zip',
    deliveryMethod: 'email',
  },
  {
    id: 'midi-device',
    slug: 'midi-chord-device',
    name: 'hx01',
    description:
      'portable midi chord generator with interactive feedback and customizable configurations',
    type: 'physical',
    isReleased: false,
    priceCents: 14900,
    currency: 'USD',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_MIDI_DEVICE,
  },
];

export const getReleasedProducts = () => products.filter((product) => product.isReleased);
export const getProductById = (id: string) => products.find((product) => product.id === id);
export const getProductBySlug = (slug: string) => products.find((product) => product.slug === slug);
export const getReleasedProductBySlug = (slug: string) =>
  products.find((product) => product.slug === slug && product.isReleased);
