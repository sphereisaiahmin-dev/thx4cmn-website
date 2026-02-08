const tagStyles = {
  music: 'bg-red-100 text-red-700',
  media: 'bg-blue-100 text-blue-700',
  marketing: 'bg-green-100 text-green-700',
};

type ProjectTag = keyof typeof tagStyles;

type Project = {
  title: string;
  tag: ProjectTag;
  contributor?: string;
};

const projects: Project[] = [
  {
    title: 'Caught Up In The Game - Casey Veggies',
    tag: 'music',
  },
  {
    title: 'universe sonic sinema episode 1: in the beggining - G.O.O.D Music',
    tag: 'music',
  },
  {
    title: 'Life is Beautiful',
    tag: 'media',
  },
  {
    title: 'Say I Wasnt - Cash Kidd , E-40',
    tag: 'music',
    contributor: 'buubackwards',
  },
  {
    title: 'Forgive Me For Being Turnt - Prince Tae',
    tag: 'music',
  },
  {
    title: 'Muse Sessions',
    tag: 'marketing',
  },
  {
    title: 'Not The Weather - King Chip , Wiz Khalifa',
    tag: 'music',
    contributor: 'smokedoutpillowhead',
  },
  {
    title: 'Omar Apollo - God Said No World Tour',
    tag: 'media',
  },
];

export default function ProjectsPage() {
  return (
    <section className="space-y-10">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-black/60">Projects</p>
        <h1 className="text-3xl uppercase tracking-[0.3em]">Selected work</h1>
        <p className="max-w-2xl text-sm text-black/70">
          A cross-section of recent releases, campaigns, and collaborations.
        </p>
      </div>

      <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-black/10 bg-black/5 p-6">
        <ul className="space-y-4 text-sm uppercase tracking-[0.3em]">
          {projects.map((project) => (
            <li
              key={`${project.title}-${project.tag}`}
              className="border-b border-black/10 pb-3 last:border-b-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{project.title}</span>
                <span
                  className={`rounded-full px-3 py-1 text-[0.55rem] uppercase tracking-[0.3em] ${tagStyles[project.tag]}`}
                >
                  {project.tag}
                </span>
              </div>
              {project.contributor ? (
                <p className="mt-2 text-xs uppercase tracking-[0.3em] text-black/50">
                  {project.contributor}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
