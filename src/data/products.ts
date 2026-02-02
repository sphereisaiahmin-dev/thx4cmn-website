export type ProductType = 'digital' | 'physical';

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: ProductType;
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
    priceCents: 2500,
    currency: 'USD',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SAMPLE_PACK,
    r2Key: 'sample-packs/thx4cmn-vol-1.zip',
  },
  {
    id: 'midi-device',
    slug: 'midi-chord-device',
    name: 'Handheld MIDI Chord Device',
    description:
      'Physical chord device with RGB keypad + Pico brain. Ships with custom thx4cmn mappings.',
    type: 'physical',
    priceCents: 14900,
    currency: 'USD',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_MIDI_DEVICE,
  },
];

export const getProductById = (id: string) => products.find((product) => product.id === id);
export const getProductBySlug = (slug: string) =>
  products.find((product) => product.slug === slug);
