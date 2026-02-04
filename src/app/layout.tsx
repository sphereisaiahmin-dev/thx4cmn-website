import type { Metadata } from 'next';

import { AudioPlayer } from '@/components/AudioPlayer';
import { Footer } from '@/components/Footer';
import { Navigation } from '@/components/Navigation';

import './globals.css';
import '@/styles/audio-player.css';

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
          <Navigation />
          <AudioPlayer />
          <main className="flex-1 py-16">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
