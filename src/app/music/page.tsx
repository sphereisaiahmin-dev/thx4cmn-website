export default function MusicPage() {
  const previousWorks = [
    { title: 'Signal Bloom', year: '2021' },
    { title: 'Glass Frequency', year: '2021' },
    { title: 'Midnight Relay', year: '2022' },
    { title: 'Grain Study', year: '2022' },
    { title: 'Copper Room', year: '2023' },
    { title: 'Parallel Drift', year: '2023' },
    { title: 'Afterimage Suite', year: '2024' },
    { title: 'City Halo', year: '2024' },
    { title: 'Current Memory', year: '2024' },
    { title: 'Noonlight', year: '2025' },
  ];

  return (
    <section className="space-y-10">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-black/60">Music</p>
        <h1 className="text-3xl uppercase tracking-[0.3em]">Previous Works</h1>
        <p className="max-w-2xl text-sm text-black/70">
          A scrollable archive of earlier sessions and releases.
        </p>
      </div>

      <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-black/10 bg-black/5 p-6">
        <ul className="space-y-4 text-sm uppercase tracking-[0.3em]">
          {previousWorks.map((work) => (
            <li key={work.title} className="flex items-center justify-between border-b border-black/10 pb-3 last:border-b-0 last:pb-0">
              <span>{work.title}</span>
              <span className="text-xs text-black/60">{work.year}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
