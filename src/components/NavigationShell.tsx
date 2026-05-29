'use client';

import dynamic from 'next/dynamic';

export const NavigationShell = dynamic(
  () => import('@/components/Navigation').then((mod) => mod.Navigation),
  {
    ssr: false,
  },
);
