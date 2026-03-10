'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { LogoScene } from './LogoScene';

const DEFAULT_HOME_LOGO_FADE_MS = 300;

const parseCssDurationMs = (rawValue: string, fallbackMs: number) => {
  const value = rawValue.trim().toLowerCase();
  if (!value) {
    return fallbackMs;
  }

  if (value.endsWith('ms')) {
    const parsed = Number.parseFloat(value.slice(0, -2));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackMs;
  }

  if (value.endsWith('s')) {
    const parsed = Number.parseFloat(value.slice(0, -1));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1000 : fallbackMs;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackMs;
};

export const HomeLogoBackground = () => {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const [isVisible, setIsVisible] = useState(isHome);
  const [shouldRender, setShouldRender] = useState(isHome);

  useEffect(() => {
    if (isHome) {
      setShouldRender(true);
      const frameId = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    setIsVisible(false);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setShouldRender(false);
      return;
    }

    const rootStyles = window.getComputedStyle(document.documentElement);
    const fadeMs = parseCssDurationMs(
      rootStyles.getPropertyValue('--route-exit-ms'),
      DEFAULT_HOME_LOGO_FADE_MS,
    );

    const timeoutId = window.setTimeout(() => {
      setShouldRender(false);
    }, fadeMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isHome]);

  if (!isHome && !shouldRender) {
    return null;
  }

  return (
    <section
      className={`home-logo-background fixed inset-0 z-40 ${
        isVisible ? 'home-logo-background--visible' : 'home-logo-background--hidden'
      }`}
      aria-hidden={!isVisible}
      aria-label="Home logo background"
    >
      <LogoScene className="home-logo-background__scene h-full w-full" fitMobileAspect />
    </section>
  );
};
