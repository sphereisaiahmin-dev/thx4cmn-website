'use client';

import { usePathname } from 'next/navigation';

import { LogoScene } from './LogoScene';

export const HomeLogoBackground = () => {
  const pathname = usePathname();
  const isHome = pathname === '/';

  return (
    <section
      className={`fixed inset-0 -z-10 transition-opacity duration-200 ${
        isHome ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!isHome}
      aria-label="Home logo background"
    >
      <LogoScene className="h-full w-full" />
    </section>
  );
};
