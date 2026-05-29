'use client';

import dynamic from 'next/dynamic';

export const HomeLogoBackgroundShell = dynamic(
  () => import('@/components/HomeLogoBackground').then((mod) => mod.HomeLogoBackground),
  {
    ssr: false,
  },
);
