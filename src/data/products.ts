export type ProductType = 'digital' | 'physical';
export type ProductDeliveryMethod = 'email';
export type ProductPurchaseStatus = 'available' | 'coming-soon';

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  contentsSummary?: string;
  type: ProductType;
  isReleased: boolean;
  purchaseStatus: ProductPurchaseStatus;
  priceCents: number;
  currency: string;
  stripePriceId?: string;
  r2Key?: string | null;
  deliveryMethod?: ProductDeliveryMethod;
}

export const COMMUNITY_FREE_PACK_PRODUCT_ID = 'community-vol-1-free-pack';
export const LEGACY_COMMUNITY_FREE_PACK_PRODUCT_IDS = ['sample-pack'] as const;

export const normalizeProductId = (id: string) =>
  LEGACY_COMMUNITY_FREE_PACK_PRODUCT_IDS.includes(
    id as (typeof LEGACY_COMMUNITY_FREE_PACK_PRODUCT_IDS)[number],
  )
    ? COMMUNITY_FREE_PACK_PRODUCT_ID
    : id;

export const products: Product[] = [
  {
    id: COMMUNITY_FREE_PACK_PRODUCT_ID,
    slug: COMMUNITY_FREE_PACK_PRODUCT_ID,
    name: 'Community Vol. 1',
    description:
      'The "Community" series is a thank you to all the producers, artists, and creators. A small free collection made to give back to the same space that helped shape our journey.',
    contentsSummary: '15 files. 6 Breaks, 7 melodies & 2 oneshots',
    type: 'digital',
    isReleased: true,
    purchaseStatus: 'available',
    priceCents: 0,
    currency: 'USD',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_COMMUNITY_PACK,
    r2Key: 'packs/Community Vol. 1.zip',
    deliveryMethod: 'email',
  },
  {
    id: 'universe-vol-1',
    slug: 'universe-vol-1',
    name: 'Universe Vol. 1',
    description:
      'The "Universe" series brings together ideas from across the THX4CMN team. With each producer contributing their own folder, style and approach, this collection was built to give creators more inspiration and more ways to create.',
    contentsSummary:
      '154 files. 19 Melodies, 23 Instrument One Shots, 17 Drum Breaks, 68 Drum One Shots, 10 Perc Loops & 17 MIDI Drum Patterns.',
    type: 'digital',
    isReleased: true,
    purchaseStatus: 'coming-soon',
    priceCents: 3000,
    currency: 'USD',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_UNIVERSE_PACK,
    r2Key: 'packs/Universe Vol. 1.zip',
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
    purchaseStatus: 'coming-soon',
    priceCents: 14900,
    currency: 'USD',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_MIDI_DEVICE,
  },
];

export const getReleasedProducts = () => products.filter((product) => product.isReleased);
export const getProductById = (id: string) =>
  products.find((product) => product.id === normalizeProductId(id));
export const getProductBySlug = (slug: string) => products.find((product) => product.slug === slug);
export const getReleasedProductBySlug = (slug: string) =>
  products.find((product) => product.slug === slug && product.isReleased);
