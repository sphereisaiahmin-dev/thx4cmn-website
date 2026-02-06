import { LogoScene } from '@/components/LogoScene';

export default function HomePage() {
  return (
    <section className="flex min-h-[60vh] items-center justify-center bg-white py-12" aria-label="Home">
      <div className="w-full max-w-4xl px-6">
        <LogoScene />
      </div>
    </section>
  );
}
