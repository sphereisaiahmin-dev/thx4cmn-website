'use client';

import { useEffect } from 'react';

const revokeAccess = () => {
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon('/api/device/access/revoke');
    return;
  }

  void fetch('/api/device/access/revoke', {
    method: 'POST',
    keepalive: true,
  });
};

export const DeviceAccessSession = () => {
  useEffect(() => {
    revokeAccess();

    const handlePageHide = () => revokeAccess();
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      revokeAccess();
    };
  }, []);

  return null;
};
