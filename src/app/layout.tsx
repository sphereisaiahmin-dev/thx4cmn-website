import type { Metadata } from 'next';
import Script from 'next/script';
import { AudioPlayerShell } from '@/components/AudioPlayerShell';
import { Footer } from '@/components/Footer';
import { HomeLogoBackgroundShell } from '@/components/HomeLogoBackgroundShell';
import { NavigationShell } from '@/components/NavigationShell';
import { RouteBodyClass } from '@/components/RouteBodyClass';

import './globals.css';
import '@/styles/audio-player.css';

export const metadata: Metadata = {
  title: 'thx4cmn',
  description: 'thx4cmn art + design group',
  icons: {
    icon: [
      {
        url: '/favicon-lighttheme.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/favicon-darktheme.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Script id="thx4cmn-first-interaction-autoplay" strategy="beforeInteractive">
          {`
            (function () {
              if (window.__thx4cmnFirstInteractionAutoplayReady) return;
              window.__thx4cmnFirstInteractionAutoplayReady = true;
              var sessionConsumedKey = 'thx4cmn:autoplay-activation-consumed';
              var readSessionConsumed = function () {
                try {
                  return window.sessionStorage.getItem(sessionConsumedKey) === 'true';
                } catch (error) {
                  return false;
                }
              };
              var writeSessionConsumed = function () {
                try {
                  window.sessionStorage.setItem(sessionConsumedKey, 'true');
                } catch (error) {
                  // Ignore storage failures; the in-document guard still prevents duplicate activation.
                }
              };
              window.__thx4cmnAutoplayActivationCount = window.__thx4cmnAutoplayActivationCount || 0;
              window.__thx4cmnAutoplayActivationConsumed = window.__thx4cmnAutoplayActivationConsumed || readSessionConsumed();
              var intentEventName = 'thx4cmn:autoplay-intent';
              var activationEventName = 'thx4cmn:autoplay-activation';
              var removeIntentListener = function () {
                window.removeEventListener('mousemove', markIntent);
              };
              var removeActivationListeners = function () {
                window.removeEventListener('pointerdown', markActivation);
                window.removeEventListener('click', markActivation);
                window.removeEventListener('touchstart', markActivation);
                window.removeEventListener('keydown', markActivation);
              };
              var markIntent = function () {
                window.__thx4cmnAutoplayIntent = true;
                removeIntentListener();
                window.dispatchEvent(new Event(intentEventName));
              };
              var markActivation = function () {
                if (window.__thx4cmnAutoplayActivationConsumed) return;
                window.__thx4cmnAutoplayActivationConsumed = true;
                writeSessionConsumed();
                removeIntentListener();
                removeActivationListeners();
                window.__thx4cmnAutoplayIntent = true;
                window.__thx4cmnAutoplayActivationCount += 1;
                window.dispatchEvent(new Event(intentEventName));
                window.dispatchEvent(new Event(activationEventName));
              };
              if (window.__thx4cmnAutoplayActivationConsumed) return;
              window.addEventListener('mousemove', markIntent, { passive: true });
              window.addEventListener('pointerdown', markActivation, { passive: true });
              window.addEventListener('click', markActivation, { passive: true });
              window.addEventListener('touchstart', markActivation, { passive: true });
              window.addEventListener('keydown', markActivation);
            })();
          `}
        </Script>
        <RouteBodyClass />
        <div className="site-background" aria-hidden="true">
          <div className="site-background__layer site-background__layer--red" />
          <div className="site-background__layer site-background__layer--green" />
          <div className="site-background__layer site-background__layer--blue" />
        </div>
        <div className="app-shell relative z-10 flex min-h-screen w-full flex-col px-6">
          <HomeLogoBackgroundShell />
          <NavigationShell />
          <AudioPlayerShell />
          <main className="app-main flex-1 py-16">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
