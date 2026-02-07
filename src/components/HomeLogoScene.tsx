'use client';

import { usePathname } from 'next/navigation';

import { LogoScene } from './LogoScene';

export const HomeLogoScene = () => {
  const pathname = usePathname();
  const isHome = pathname === '/';

  return (
    <section
      className={`fixed inset-0 -z-10 transition-opacity duration-200 ${
        isHome ? 'opacity-100' : 'opacity-0'
      }`}
      aria-label="Home logo background"
      aria-hidden={!isHome}
    >
      <LogoScene className="h-full w-full" />
    </section>
  );
};
