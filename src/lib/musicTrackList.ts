import type { Track } from './webplayer/types';

export const MUSIC_PREFIX = 'music/';

const safeDecodeTitle = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const deriveMusicTitle = (key: string) => {
  const trimmed = key.replace(MUSIC_PREFIX, '').replace(/\.mp3$/i, '');
  return safeDecodeTitle(trimmed.replace(/\+/g, ' '));
};

export const toPublicMusicTracks = (keys: ReadonlyArray<string>): Track[] =>
  keys
    .filter((key) => key.startsWith(MUSIC_PREFIX) && key.toLowerCase().endsWith('.mp3'))
    .map((key) => ({
      key,
      title: deriveMusicTitle(key),
    }));
