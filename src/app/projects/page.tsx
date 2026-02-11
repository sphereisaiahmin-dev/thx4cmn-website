const tagStyles = {
  music: 'bg-red-100 text-red-700',
  media: 'bg-blue-100 text-blue-700',
  marketing: 'bg-green-100 text-green-700',
  design: 'bg-purple-100 text-purple-700',
};

type ProjectTag = keyof typeof tagStyles;

type Project = {
  title: string;
  tags: ProjectTag[];
  details?: string[];
};

const projects: Project[] = [
  {
    title: 'CAUGHT UP IN THE GAME DISC 2- CASEY VEGGIES',
    tags: ['music'],
    details: [
      'Track 7 “Pink Slip” ft. Ab-Soul / AP x FOCUS',
      'Track 10 “Weight Up” ft. Ay Ay SnaggLay / Therealwikked',
    ],
  },
  {
    title: 'UNIVERSE SONIC SINEMA EPISODE 1: IN THE BEGGINING - G.O.O.D MUSIC - MALIK YUSEF',
    tags: ['music'],
    details: [
      'Grammy Nominated for Best Spoken Word Poetry Album',
      'Produced/Engineered Tracks 3,11,12, &19',
    ],
  },
  {
    title: 'LIFE IS BEAUTIFUL',
    tags: ['media', 'marketing', 'design'],
    details: ['Immersive experience and activation'],
  },
  {
    title: 'SAY I WASNT - CASH KIDD ft. E-40',
    tags: ['music'],
    details: ['produced by BUUBACKWARDS'],
  },
  {
    title: 'FORGIVE ME FOR BEING TURNT - PRINCE TAE',
    tags: ['music'],
    details: ['Produced/Engineered tracks 1,3,5,7,9,&11'],
  },
  {
    title: 'MUSE SESSIONS -',
    tags: ['marketing'],
  },
  {
    title: 'NOT THE WEATHER - KING CHIP / WIZ KHALIFA',
    tags: ['music'],
    details: ['produced by PILLOWHEAD'],
  },
  {
    title: 'OMAR APOLLO - GOD SAID NO WORLD TOUR',
    tags: ['media'],
  },
  {
    title: 'M-AUDIO',
    tags: ['marketing'],
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
              key={`${project.title}-${project.tags.join('-')}`}
              className="border-b border-black/10 pb-3 last:border-b-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{project.title}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {project.tags.map((tag) => (
                    <span
                      key={`${project.title}-${tag}`}
                      className={`rounded-full px-3 py-1 text-[0.55rem] uppercase tracking-[0.3em] ${tagStyles[tag]}`}
                    >
                      ({tag})
                    </span>
                  ))}
                </div>
              </div>
              {project.details?.length ? (
                <ul className="mt-2 space-y-1 text-xs uppercase tracking-[0.3em] text-black/50">
                  {project.details.map((detail) => (
                    <li key={detail}>-{detail}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
