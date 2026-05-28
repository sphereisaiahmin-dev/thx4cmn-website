import type { Track } from '@/lib/webplayer/types';

export const MUSIC_PREFIX = 'music/';

const MP3_EXTENSION = '.mp3';

const byKey = (left: string, right: string) => left.localeCompare(right, undefined, { sensitivity: 'base' });

const getRelativeMusicKey = (key: string) => (key.startsWith(MUSIC_PREFIX) ? key.slice(MUSIC_PREFIX.length) : key);

export const isPlayableMusicKey = (key: string) => {
  if (!key.startsWith(MUSIC_PREFIX) || key.endsWith('/')) {
    return false;
  }

  const relativeKey = getRelativeMusicKey(key);
  if (!relativeKey || relativeKey.includes('/')) {
    return false;
  }

  return relativeKey.toLowerCase().endsWith(MP3_EXTENSION);
};

export const deriveTrackTitleFromKey = (key: string) => {
  const relativeKey = getRelativeMusicKey(key);
  const extensionPattern = new RegExp(`${MP3_EXTENSION}$`, 'i');
  return decodeURIComponent(relativeKey.replace(/\+/g, ' ').replace(extensionPattern, ''));
};

export const createTracksFromKeys = (keys: string[]): Track[] =>
  [...keys]
    .filter(isPlayableMusicKey)
    .sort(byKey)
    .map((key) => ({
      key,
      title: deriveTrackTitleFromKey(key),
    }));
