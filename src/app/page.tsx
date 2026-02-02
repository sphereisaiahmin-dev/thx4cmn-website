import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="space-y-16">
      <div className="space-y-6">
        <p className="text-xs uppercase tracking-[0.4em] text-white/60">thx4cmn</p>
        <h1 className="text-4xl uppercase tracking-[0.3em] md:text-6xl">art + design group</h1>
        <p className="max-w-2xl text-sm text-white/70">
          Minimal, experimental, and forward-leaning. thx4cmn blends sound, hardware, and
          interactive experiences for the next wave of creators.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/store"
            className="rounded-full border border-white/40 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-white hover:text-black"
          >
            Shop releases
          </Link>
          <Link
            href="/music"
            className="rounded-full border border-white/20 px-6 py-3 text-xs uppercase tracking-[0.3em] text-white/70"
          >
            Listen
          </Link>
        </div>
      </div>

      <div className="grid gap-8 border border-white/10 bg-white/5 p-8 md:grid-cols-2">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Three.js portals</p>
          <h2 className="text-2xl uppercase tracking-[0.3em]">Spatial worlds</h2>
          <p className="text-sm text-white/70">
            Interactive experiences live on Netlify. Embed them here or send viewers to the
            dedicated scene.
          </p>
          <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.3em]">
            <a href="https://thx4cmn-experience.netlify.app" target="_blank" rel="noreferrer">
              Open experience
            </a>
            <a href="https://thx4cmn-experience.netlify.app" target="_blank" rel="noreferrer">
              Embed link
            </a>
          </div>
        </div>
        <div className="flex items-center justify-center border border-white/10 bg-black/40 p-6 text-sm text-white/50">
          <span>Embed preview placeholder</span>
        </div>
      </div>
    </section>
  );
}
