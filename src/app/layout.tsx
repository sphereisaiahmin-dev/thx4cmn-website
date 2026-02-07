import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Footer } from '@/components/Footer';
import { HomeLogoBackground } from '@/components/HomeLogoBackground';
import { Navigation } from '@/components/Navigation';

import './globals.css';
import '@/styles/audio-player.css';

const AudioPlayer = dynamic(() => import('@/components/AudioPlayer').then((mod) => mod.AudioPlayer), {
  ssr: false,
});

export const metadata: Metadata = {
  title: 'thx4cmn',
  description: 'thx4cmn art + design group',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen w-full flex-col px-6">
          <HomeLogoBackground />
          <Navigation />
          <AudioPlayer />
          <main className="flex-1 py-16">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
