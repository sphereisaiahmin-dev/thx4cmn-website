import { cookies } from 'next/headers';

import { DeviceAccessGate } from '@/components/DeviceAccessGate';
import { DeviceAccessSession } from '@/components/DeviceAccessSession';
import DeviceExperience from '@/components/DeviceExperience';
import { HX01_ACCESS_COOKIE_NAME, verifyHx01AccessToken } from '@/lib/hx01Access';

export default async function DevicePage() {
  const cookieStore = await cookies();
  const hasAccess = verifyHx01AccessToken(cookieStore.get(HX01_ACCESS_COOKIE_NAME)?.value);

  if (hasAccess) {
    return (
      <>
        <DeviceAccessSession />
        <DeviceExperience />
      </>
    );
  }

  return (
    <section className="relative">
      <div
        className="pointer-events-none select-none blur-[10px]"
        aria-hidden="true"
        inert
      >
        <DeviceExperience />
      </div>
      <DeviceAccessGate />
    </section>
  );
}
