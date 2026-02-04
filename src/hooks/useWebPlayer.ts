import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { WebPlayerEngine } from '@/lib/webplayer/engine';
import type { PlayerStatus, Track } from '@/lib/webplayer/types';

type PlayerState = {
  tracks: Track[];
  currentIndex: number;
  status: PlayerStatus;
  error: string | null;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
};

type PlayerAction =
  | { type: 'set-tracks'; payload: Track[] }
  | { type: 'set-index'; payload: number }
  | { type: 'set-status'; payload: PlayerStatus }
  | { type: 'set-error'; payload: string | null }
  | { type: 'set-playing'; payload: boolean }
  | { type: 'set-duration'; payload: number }
  | { type: 'set-current-time'; payload: number };

const initialState: PlayerState = {
  tracks: [],
  currentIndex: 0,
  status: 'idle',
  error: null,
  isPlaying: false,
  duration: 0,
  currentTime: 0,
};

const reducer = (state: PlayerState, action: PlayerAction): PlayerState => {
  switch (action.type) {
    case 'set-tracks':
      return {
        ...state,
        tracks: action.payload,
        currentIndex: action.payload.length ? Math.min(state.currentIndex, action.payload.length - 1) : 0,
      };
    case 'set-index':
      return { ...state, currentIndex: action.payload };
    case 'set-status':
      return { ...state, status: action.payload };
    case 'set-error':
      return { ...state, error: action.payload };
    case 'set-playing':
      return { ...state, isPlaying: action.payload };
    case 'set-duration':
      return { ...state, duration: action.payload };
    case 'set-current-time':
      return { ...state, currentTime: action.payload };
    default:
      return state;
  }
};

const isExpiredError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('403') || message.includes('forbidden') || message.includes('expired');
};

export const useWebPlayer = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const engineRef = useRef<WebPlayerEngine | null>(null);
  const autoPlayRef = useRef(false);

  const fetchSignedUrl = useCallback(async (key: string) => {
    const response = await fetch(`/api/music/signed-url?key=${encodeURIComponent(key)}`);
    if (!response.ok) {
      throw new Error(`Failed to get signed URL (${response.status}).`);
    }
    const data = await response.json();
    if (!data.url) {
      throw new Error('Signed URL missing.');
    }
    return data.url as string;
  }, []);

  const loadTrack = useCallback(
    async (track: Track | undefined) => {
      if (!track || !engineRef.current) return;
      dispatch({ type: 'set-status', payload: 'loading-track' });
      dispatch({ type: 'set-error', payload: null });
      dispatch({ type: 'set-duration', payload: 0 });
      dispatch({ type: 'set-current-time', payload: 0 });

      const loadWithRetry = async (hasRetried: boolean) => {
        try {
          const url = await fetchSignedUrl(track.key);
          await engineRef.current?.load(url);
        } catch (error) {
          if (!hasRetried && isExpiredError(error)) {
            await loadWithRetry(true);
            return;
          }
          throw error;
        }
      };

      try {
        await loadWithRetry(false);
        dispatch({ type: 'set-status', payload: 'ready' });
        if (autoPlayRef.current) {
          autoPlayRef.current = false;
          try {
            await engineRef.current?.play();
          } catch (error) {
            dispatch({
              type: 'set-error',
              payload: error instanceof Error ? error.message : 'Unable to start playback.',
            });
          }
        }
      } catch (error) {
        dispatch({
          type: 'set-status',
          payload: 'error',
        });
        dispatch({
          type: 'set-error',
          payload: error instanceof Error ? error.message : 'Unable to load the selected track.',
        });
      }
    },
    [fetchSignedUrl],
  );

  const loadTracks = useCallback(async () => {
    dispatch({ type: 'set-status', payload: 'loading-list' });
    dispatch({ type: 'set-error', payload: null });
    try {
      const response = await fetch('/api/music/list');
      if (!response.ok) {
        throw new Error(`Failed to load tracks (${response.status}).`);
      }
      const data = await response.json();
      const nextTracks = Array.isArray(data.tracks) ? data.tracks : [];
      dispatch({ type: 'set-tracks', payload: nextTracks });
      if (nextTracks.length > 0) {
        dispatch({ type: 'set-index', payload: 0 });
      }
      dispatch({ type: 'set-status', payload: 'ready' });
    } catch (error) {
      dispatch({ type: 'set-status', payload: 'error' });
      dispatch({
        type: 'set-error',
        payload: error instanceof Error ? error.message : 'Unable to load tracks.',
      });
    }
  }, []);

  useEffect(() => {
    const engine = new WebPlayerEngine();
    engineRef.current = engine;

    const audio = engine.getAudioElement();
    const handleTimeUpdate = () => {
      dispatch({ type: 'set-current-time', payload: audio.currentTime || 0 });
    };
    const handleDuration = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      dispatch({ type: 'set-duration', payload: duration });
    };
    const handlePlay = () => dispatch({ type: 'set-playing', payload: true });
    const handlePause = () => dispatch({ type: 'set-playing', payload: false });
    const handleEnded = () => dispatch({ type: 'set-playing', payload: false });
    const handleError = () => {
      dispatch({ type: 'set-error', payload: 'Audio playback error.' });
      dispatch({ type: 'set-status', payload: 'error' });
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDuration);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    void loadTracks();

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDuration);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      engine.destroy();
    };
  }, [loadTracks]);

  useEffect(() => {
    if (!state.tracks.length) return;
    void loadTrack(state.tracks[state.currentIndex]);
  }, [loadTrack, state.currentIndex, state.tracks]);

  const currentTrack = state.tracks[state.currentIndex];

  const controlsDisabled =
    state.status === 'loading-list' || state.status === 'loading-track' || !state.tracks.length;

  const handlePlayToggle = useCallback(async () => {
    if (!engineRef.current || controlsDisabled) return;
    if (state.isPlaying) {
      engineRef.current.pause();
      return;
    }
    try {
      await engineRef.current.play();
    } catch (error) {
      dispatch({
        type: 'set-error',
        payload: error instanceof Error ? error.message : 'Unable to start playback.',
      });
    }
  }, [controlsDisabled, state.isPlaying]);

  const handleSeek = useCallback(
    (time: number) => {
      if (!engineRef.current || !Number.isFinite(time)) return;
      engineRef.current.seek(time);
      dispatch({ type: 'set-current-time', payload: time });
    },
    [],
  );

  const handlePrev = useCallback(() => {
    if (!state.tracks.length) return;
    autoPlayRef.current = state.isPlaying;
    engineRef.current?.pause();
    dispatch({ type: 'set-playing', payload: false });
    const nextIndex = (state.currentIndex - 1 + state.tracks.length) % state.tracks.length;
    dispatch({ type: 'set-index', payload: nextIndex });
  }, [state.currentIndex, state.isPlaying, state.tracks.length]);

  const handleNext = useCallback(() => {
    if (!state.tracks.length) return;
    autoPlayRef.current = state.isPlaying;
    engineRef.current?.pause();
    dispatch({ type: 'set-playing', payload: false });
    const nextIndex = (state.currentIndex + 1) % state.tracks.length;
    dispatch({ type: 'set-index', payload: nextIndex });
  }, [state.currentIndex, state.isPlaying, state.tracks.length]);

  const statusMessage = useMemo(() => {
    if (state.error) return state.error;
    if (state.status === 'loading-list') return 'Loading tracks...';
    if (state.status === 'loading-track') return 'Loading track...';
    if (!state.tracks.length) return 'No tracks available yet.';
    return null;
  }, [state.error, state.status, state.tracks.length]);

  return {
    state,
    currentTrack,
    statusMessage,
    controlsDisabled,
    actions: {
      handlePlayToggle,
      handlePrev,
      handleNext,
      handleSeek,
    },
  };
};
