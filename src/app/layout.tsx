import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Footer } from '@/components/Footer';
import { HomeLogoBackground } from '@/components/HomeLogoBackground';
import { Navigation } from '@/components/Navigation';
import { RouteBodyClass } from '@/components/RouteBodyClass';

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
        <RouteBodyClass />
        <div className="site-background" aria-hidden="true">
          <div className="site-background__layer site-background__layer--red" />
          <div className="site-background__layer site-background__layer--green" />
          <div className="site-background__layer site-background__layer--blue" />
        </div>
        <div className="app-shell relative z-10 flex min-h-screen w-full flex-col px-6">
          <HomeLogoBackground />
          <Navigation />
          <AudioPlayer />
          <main className="app-main flex-1 py-16">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
