'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const STORE_LOCKED_BODY_CLASS = 'route-store-locked';

export const RouteBodyClass = () => {
  const pathname = usePathname();
  const isStoreIndex = pathname === '/store';

  useEffect(() => {
    document.body.classList.toggle(STORE_LOCKED_BODY_CLASS, isStoreIndex);

    return () => {
      document.body.classList.remove(STORE_LOCKED_BODY_CLASS);
    };
  }, [isStoreIndex]);

  return null;
};
