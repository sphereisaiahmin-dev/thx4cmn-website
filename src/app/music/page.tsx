import { playlist } from '@/data/playlist';

export default function MusicPage() {
  return (
    <section className="space-y-12">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Music</p>
        <h1 className="text-3xl uppercase tracking-[0.3em] text-slate-700">Sessions + Releases</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          The player stays pinned across pages. Explore the current playlist below and check in
          for future releases, videos, and interactive drops.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {playlist.map((track) => (
          <div key={track.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{track.artist}</p>
            <h3 className="text-lg uppercase tracking-[0.3em]">{track.title}</h3>
            {track.bpm && <p className="text-xs text-slate-400">{track.bpm} bpm</p>}
          </div>
        ))}
      </div>

      <div className="space-y-4 border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-lg uppercase tracking-[0.3em] text-slate-700">Interactive embeds</h2>
        <p className="text-sm text-slate-500">
          Load external Three.js worlds or immersive music visuals using the embed pattern
          below.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <iframe
            title="thx4cmn experience"
            src="https://thx4cmn-experience.netlify.app"
            className="h-64 w-full rounded-2xl border border-slate-200"
          />
          <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 text-sm text-slate-400">
            Future embed slot
          </div>
        </div>
      </div>
    </section>
  );
}
