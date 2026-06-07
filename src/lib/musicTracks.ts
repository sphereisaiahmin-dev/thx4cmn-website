import { listR2Objects } from './r2';
import { MUSIC_PREFIX, toPublicMusicTracks } from './musicTrackList';
import type { Track } from './webplayer/types';

const TRACK_CACHE_TTL_MS = 60 * 1000;

let trackCache:
  | {
      expiresAt: number;
      tracks: Track[];
      keys: Set<string>;
    }
  | null = null;

export const getPublicMusicTracks = async () => {
  const now = Date.now();
  if (trackCache && trackCache.expiresAt > now) {
    return trackCache.tracks;
  }

  const tracks = toPublicMusicTracks(await listR2Objects(MUSIC_PREFIX));
  trackCache = {
    expiresAt: now + TRACK_CACHE_TTL_MS,
    tracks,
    keys: new Set(tracks.map((track) => track.key)),
  };

  return tracks;
};

export const isPublicMusicTrackKey = async (key: string) => {
  if (!trackCache || trackCache.expiresAt <= Date.now()) {
    await getPublicMusicTracks();
  }

  return trackCache?.keys.has(key) ?? false;
};

export const resetMusicTrackCacheForTest = () => {
  trackCache = null;
};

export { deriveMusicTitle, MUSIC_PREFIX, toPublicMusicTracks } from './musicTrackList';
