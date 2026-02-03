export interface Track {
  id: string;
  title: string;
  artist: string;
  key: string;
  bpm?: number;
}

export const playlist: Track[] = [
  {
    id: '4thefam',
    title: '4 the fam',
    artist: 'thx4cmn',
    key: 'music/4thefam-84bpm_BEAT-thx4cmn-L-T.mp3',
    bpm: 84,
  },
  {
    id: '4thelove',
    title: '4 the love',
    artist: 'thx4cmn',
    key: 'music/4thelove-101bpm_BEAT-thx4cmn-L-C-T.mp3',
    bpm: 101,
  },
  {
    id: '8mile',
    title: '8 mile',
    artist: 'thx4cmn',
    key: 'music/8mile-138bpm_BEAT-thx4cmn-L-T.mp3',
    bpm: 138,
  },
];
