export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  bpm?: number;
}

export const playlist: Track[] = [
  {
    id: '4thefam',
    title: '4 the fam',
    artist: 'thx4cmn',
    url: 'https://dl.dropboxusercontent.com/scl/fi/dy67jy0psprw0rfwbv2k4/4thefam-84bpm_BEAT-thx4cmn-L-T.mp3?raw=1',
    bpm: 84,
  },
  {
    id: '4thelove',
    title: '4 the love',
    artist: 'thx4cmn',
    url: 'https://dl.dropboxusercontent.com/scl/fi/y9cr45nvm7rih0ybbnha8/4thelove-101bpm_BEAT-thx4cmn-L-C-T.mp3?raw=1',
    bpm: 101,
  },
  {
    id: '8mile',
    title: '8 mile',
    artist: 'thx4cmn',
    url: 'https://dl.dropboxusercontent.com/scl/fi/w29ydbn6uk9fkanp7m2za/8mile-138bpm_BEAT-thx4cmn-L-T.mp3?raw=1',
    bpm: 138,
  },
];
