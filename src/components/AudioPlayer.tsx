'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';

import { formatTime } from '@/lib/format';

type ToneModule = typeof import('tone');

type Track = {
  key: string;
  title: string;
};

type PlaybackState = {
  playbackRate: number;
  isReversing: boolean;
  loop: {
    start: number | null;
    end: number | null;
  };
};

let cachedTone: ToneModule | null = null;
let tonePromise: Promise<ToneModule> | null = null;

const loadToneModule = async () => {
  if (cachedTone) return cachedTone;
  if (!tonePromise) {
    tonePromise = import('tone').then((toneImport) => {
      const normalized = (toneImport as ToneModule & { default?: ToneModule }).default ?? toneImport;
      return normalized as ToneModule;
    });
  }
  cachedTone = await tonePromise;
  return cachedTone;
};

const DOT_COUNT = 24;
const ARTIST_LABEL = 'thx4cmn';

const isExpiredError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('403') || message.includes('forbidden') || message.includes('expired');
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const AudioPlayer = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const toneRef = useRef<ToneModule | null>(null);
  const playerRef = useRef<import('tone').Player | null>(null);
  const rafRef = useRef<number | null>(null);
  const startOffsetRef = useRef(0);
  const startTimeRef = useRef(0);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    playbackRate: 1,
    isReversing: false,
    loop: {
      start: null,
      end: null,
    },
  });

  const track = tracks[currentIndex];
  const dots = useMemo(() => Array.from({ length: DOT_COUNT }, (_, i) => i), []);

  const loadTone = async () => {
    if (toneRef.current) return toneRef.current;
    const tone = await loadToneModule();
    toneRef.current = tone;
    return tone;
  };

  const fetchSignedUrl = async (key: string) => {
    const response = await fetch(`/api/music/signed-url?key=${encodeURIComponent(key)}`);
    if (!response.ok) {
      throw new Error(`Failed to get signed URL (${response.status}).`);
    }
    const data = await response.json();
    if (!data.url) {
      throw new Error('Signed URL missing.');
    }
    return data.url as string;
  };

  const resetTransport = () => {
    startOffsetRef.current = 0;
    startTimeRef.current = 0;
    setCurrentTime(0);
    setPlaybackState({
      playbackRate: 1,
      isReversing: false,
      loop: {
        start: null,
        end: null,
      },
    });
  };

  const disposePlayer = () => {
    if (playerRef.current) {
      playerRef.current.dispose();
      playerRef.current = null;
    }
  };

  const loadTrack = async (index: number) => {
    const nextTrack = tracks[index];
    if (!nextTrack) return;

    const tone = await loadTone();
    if (!tone?.Player || typeof tone.Player !== 'function') {
      setTrackError('Audio engine failed to initialize.');
      return;
    }

    setIsReady(false);
    setIsPlaying(false);
    setDuration(0);
    setTrackError(null);
    setIsLoadingTrack(true);
    resetTransport();

    disposePlayer();

    const player = new tone.Player({
      loop: false,
      reverse: false,
      autostart: false,
    }).toDestination();

    const loadWithSignedUrl = async (hasRetried: boolean) => {
      try {
        const url = await fetchSignedUrl(nextTrack.key);
        await player.load(url);
        setDuration(player.buffer.duration);
        setIsReady(true);
        playerRef.current = player;
      } catch (error) {
        if (!hasRetried && isExpiredError(error)) {
          await loadWithSignedUrl(true);
          return;
        }
        throw error;
      }
    };

    try {
      await loadWithSignedUrl(false);
    } catch (error) {
      player.dispose();
      if (playerRef.current === player) {
        playerRef.current = null;
      }
      setTrackError('Unable to load the selected track.');
    } finally {
      setIsLoadingTrack(false);
    }
  };

  const ensureAudioContext = async () => {
    const tone = await loadTone();
    if (!tone) return;
    if (tone.getContext().state !== 'running') {
      await tone.start();
    }
  };

  const handleUserGesture = async () => {
    if (!hasInteracted) {
      setHasInteracted(true);
    }
    await ensureAudioContext();
  };

  const currentPosition = () => {
    const tone = toneRef.current;
    if (!playerRef.current || !tone) return 0;
    const elapsed = (tone.now() - startTimeRef.current) * playbackState.playbackRate;
    const direction = playbackState.isReversing ? -1 : 1;
    return clamp(startOffsetRef.current + direction * elapsed, 0, duration);
  };

  const startPlayback = async () => {
    await ensureAudioContext();
    if (!playerRef.current?.buffer.loaded) return;
    const tone = toneRef.current;
    if (!tone) return;

    playerRef.current.playbackRate = playbackState.playbackRate;
    playerRef.current.reverse = playbackState.isReversing;
    playerRef.current.start(tone.now(), startOffsetRef.current);
    startTimeRef.current = tone.now();
    setIsPlaying(true);
  };

  const stopPlayback = () => {
    if (!playerRef.current) return;
    playerRef.current.stop();
    startOffsetRef.current = currentPosition();
    setCurrentTime(startOffsetRef.current);
    setIsPlaying(false);
  };

  const togglePlay = async () => {
    if (isLoadingTrack) return;
    await handleUserGesture();

    if (!playerRef.current?.buffer.loaded) {
      await loadTrack(currentIndex);
    }

    if (!playerRef.current?.buffer.loaded) return;

    if (isPlaying) {
      stopPlayback();
    } else {
      await startPlayback();
    }
  };

  const handleSeek = async (position: number) => {
    await handleUserGesture();
    if (!playerRef.current?.buffer.loaded) return;
    const tone = toneRef.current;
    if (!tone) return;

    playerRef.current.stop();
    startOffsetRef.current = clamp(position, 0, duration);
    startTimeRef.current = tone.now();
    if (isPlaying) {
      playerRef.current.start(tone.now(), startOffsetRef.current);
    }
    setCurrentTime(startOffsetRef.current);
  };

  const selectTrack = async (index: number) => {
    setCurrentIndex(index);
    resetTransport();
    stopPlayback();
    if (hasInteracted) {
      await loadTrack(index);
    }
  };

  const handlePrev = () => {
    if (!tracks.length) return;
    void handleUserGesture();
    const nextIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    void selectTrack(nextIndex);
  };

  const handleNext = () => {
    if (!tracks.length) return;
    void handleUserGesture();
    const nextIndex = (currentIndex + 1) % tracks.length;
    void selectTrack(nextIndex);
  };

  const updateGradient = (event: PointerEvent<HTMLDivElement>) => {
    const element = containerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    element.style.setProperty('--mouse-x', `${clamp(x, 0, 100)}%`);
    element.style.setProperty('--mouse-y', `${clamp(y, 0, 100)}%`);
  };

  const resetGradient = () => {
    const element = containerRef.current;
    if (!element) return;
    element.style.setProperty('--mouse-x', '50%');
    element.style.setProperty('--mouse-y', '50%');
  };

  useEffect(() => {
    let isMounted = true;

    const loadList = async () => {
      setIsLoadingList(true);
      setListError(null);
      try {
        const response = await fetch('/api/music/list');
        if (!response.ok) {
          throw new Error(`Failed to load tracks (${response.status}).`);
        }
        const data = await response.json();
        if (!isMounted) return;
        const nextTracks = Array.isArray(data.tracks) ? data.tracks : [];
        setTracks(nextTracks);
        if (nextTracks.length > 0) {
          setCurrentIndex(0);
        }
      } catch (error) {
        if (!isMounted) return;
        setTracks([]);
        setListError('Unable to load tracks. Please try again later.');
      } finally {
        if (isMounted) {
          setIsLoadingList(false);
        }
      }
    };

    void loadList();

    return () => {
      isMounted = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      disposePlayer();
    };
  }, []);

  useEffect(() => {
    if (!tracks.length || !hasInteracted) return;
    void loadTrack(currentIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, tracks, hasInteracted]);

  useEffect(() => {
    if (!isPlaying) return;

    const tick = () => {
      const position = currentPosition();
      if (position >= duration && duration > 0) {
        setCurrentTime(duration);
        stopPlayback();
        return;
      }
      setCurrentTime(position);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, playbackState.playbackRate, playbackState.isReversing, duration]);

  const dotSlice = duration ? duration / DOT_COUNT : 0;
  const activeIndex = dotSlice ? Math.floor(currentTime / dotSlice) : -1;

  const controlsDisabled = isLoadingList || !tracks.length || !!listError;
  const statusMessage = listError
    ? listError
    : isLoadingList
      ? 'Loading tracks...'
      : !tracks.length
        ? 'No tracks available yet.'
        : trackError;

  return (
    <div
      className="audio-player"
      ref={containerRef}
      onPointerMove={updateGradient}
      onPointerLeave={resetGradient}
    >
      <div className="audio-player__header">
        <div className="audio-player__title">
          <span>{track ? track.title : 'No track loaded'}</span>
          <span className="audio-player__artist">{track ? ARTIST_LABEL : ''}</span>
        </div>
        <div className="audio-player__controls">
          <button type="button" onClick={handlePrev} disabled={controlsDisabled}>
            prev
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={controlsDisabled || isLoadingTrack}
          >
            {isPlaying ? 'pause' : isReady && !isLoadingTrack ? 'play' : 'loading'}
          </button>
          <button type="button" onClick={handleNext} disabled={controlsDisabled}>
            next
          </button>
        </div>
      </div>
      {statusMessage && <div className="audio-player__status">{statusMessage}</div>}
      <div className="audio-player__progress">
        <div className="audio-player__dots" role="list">
          {dots.map((dot) => {
            const isActive = dot <= activeIndex;
            return (
              <button
                type="button"
                key={dot}
                className={`audio-player__dot ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (!dotSlice) return;
                  void handleSeek(dotSlice * (dot + 0.5));
                }}
                aria-label={`Seek to ${Math.round((dot / DOT_COUNT) * 100)} percent`}
                disabled={controlsDisabled}
              />
            );
          })}
        </div>
        <div className="audio-player__time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
    </div>
  );
};
