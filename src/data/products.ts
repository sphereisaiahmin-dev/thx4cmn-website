export type ProductType = 'digital' | 'physical';

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
}

export const products: Product[] = [
  {
    id: 'sample-pack',
    slug: 'sample-pack',
    name: 'THX4CMN Sample Pack Vol. 1',
    description:
      'Downloadable sample pack with curated drum, texture, and instrument sounds from the lab.',
    type: 'digital',
    isReleased: true,
    priceCents: 2500,
    currency: 'USD',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SAMPLE_PACK,
    r2Key: 'sample-packs/thx4cmn-vol-1.zip',
  },
  {
    id: 'universe-vol-1',
    slug: 'universe-vol-1',
    name: 'Universe Vol. 1',
    description:
      'Downloadable melody pack with spaced-out keys, cosmic textures, and celestial loops built for wide, atmospheric ideas.',
    type: 'digital',
    isReleased: true,
    priceCents: 2500,
    currency: 'USD',
    r2Key: null,
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
