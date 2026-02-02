import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="space-y-16">
      <div className="space-y-6">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">thx4cmn</p>
        <h1 className="text-4xl uppercase tracking-[0.3em] text-slate-700 md:text-6xl">
          art + design group
        </h1>
        <p className="max-w-2xl text-sm text-slate-500">
          Minimal, experimental, and forward-leaning. thx4cmn blends sound, hardware, and
          interactive experiences for the next wave of creators.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/store"
            className="rounded-full border border-slate-300 px-6 py-3 text-xs uppercase tracking-[0.3em] text-slate-600 transition hover:border-slate-400 hover:bg-slate-900 hover:text-white"
          >
            Shop releases
          </Link>
          <Link
            href="/music"
            className="rounded-full border border-slate-200 px-6 py-3 text-xs uppercase tracking-[0.3em] text-slate-500 hover:border-slate-300"
          >
            Listen
          </Link>
        </div>
      </div>
    </section>
  );
}
