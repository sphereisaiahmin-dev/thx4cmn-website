'use client';

import { usePathname } from 'next/navigation';

import { LogoScene } from './LogoScene';

export const HomeLogoBackground = () => {
  const pathname = usePathname();
  const isHome = pathname === '/';

  if (!isHome) {
    return null;
  }

  return (
    <section
      className="home-logo-background fixed inset-0 z-40"
      aria-hidden={false}
      aria-label="Home logo background"
    >
      <LogoScene className="home-logo-background__scene h-full w-full" fitMobileAspect />
    </section>
  );
};
