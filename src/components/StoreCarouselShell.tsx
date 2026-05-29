'use client';

import dynamic from 'next/dynamic';

import type { Product } from '@/data/products';

const StoreCarousel = dynamic(
  () => import('@/components/StoreCarousel').then((mod) => mod.StoreCarousel),
  {
    ssr: false,
  },
);

interface StoreCarouselShellProps {
  products: Product[];
}

export const StoreCarouselShell = ({ products }: StoreCarouselShellProps) => {
  return <StoreCarousel products={products} />;
};
