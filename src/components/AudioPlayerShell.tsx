'use client';

import dynamic from 'next/dynamic';

export const AudioPlayerShell = dynamic(
  () => import('@/components/AudioPlayer').then((mod) => mod.AudioPlayer),
  {
    ssr: false,
  },
);
