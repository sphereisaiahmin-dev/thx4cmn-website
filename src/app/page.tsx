import { LogoScene } from '@/components/LogoScene';

export default function HomePage() {
  return (
    <section className="fixed inset-0 -z-10" aria-label="Home logo background">
      <LogoScene className="h-full w-full" />
    </section>
  );
}
