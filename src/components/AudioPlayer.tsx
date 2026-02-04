'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { formatTime } from '@/lib/format';

type ToneModule = typeof import('tone');
type ToneModuleWithDefault = ToneModule & { default?: ToneModule };

type Track = {
  key: string;
  title: string;
};

let cachedTone: ToneModule | null = null;
let tonePromise: Promise<ToneModule> | null = null;

const loadToneModule = async () => {
  if (cachedTone) return cachedTone;
  if (!tonePromise) {
    tonePromise = import('tone').then((toneImport) => {
      const normalized = (toneImport as ToneModuleWithDefault).default ?? toneImport;
      return normalized as ToneModule;
    });
  }
  cachedTone = await tonePromise;
  return cachedTone;
};

const NUM_DOTS = 20;
const ARTIST_LABEL = 'thx4cmn';

const getRandomIndex = (length: number, exclude: number) => {
  if (length <= 1) return exclude;
  let next = exclude;
  while (next === exclude) {
    next = Math.floor(Math.random() * length);
  }
  return next;
};

const isExpiredError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('403') || message.includes('forbidden') || message.includes('expired');
};

export const AudioPlayer = () => {
  const toneRef = useRef<ToneModule | null>(null);
  const playerRef = useRef<import('tone').Player | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const loopIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isReversing, setIsReversing] = useState(false);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [startOffset, setStartOffset] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  const track = tracks[currentIndex];
  const dots = useMemo(() => Array.from({ length: NUM_DOTS }, (_, i) => i), []);

  const cleanupIntervals = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current);
      loopIntervalRef.current = null;
    }
  };

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
    setCurrentTime(0);
    setDuration(0);
    setLoopA(null);
    setLoopB(null);
    setTrackError(null);
    setIsLoadingTrack(true);

    if (playerRef.current) {
      playerRef.current.dispose();
    }

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

  const startPlayback = async () => {
    await ensureAudioContext();
    if (!playerRef.current?.buffer.loaded) return;

    playerRef.current.playbackRate = playbackRate;
    playerRef.current.reverse = isReversing;
    const tone = toneRef.current;
    if (!tone) return;
    playerRef.current.start(tone.now(), startOffset);
    setStartTime(tone.now());
    setIsPlaying(true);
  };

  const stopPlayback = () => {
    playerRef.current?.stop();
    setIsPlaying(false);
  };

  const handleTogglePlay = async () => {
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
    playerRef.current.stop();
    setStartOffset(position);
    const tone = toneRef.current;
    if (!tone) return;
    setStartTime(tone.now());
    playerRef.current.start(tone.now(), position);
    setIsPlaying(true);
  };

  const currentPosition = () => {
    const tone = toneRef.current;
    if (!playerRef.current || !tone) return 0;
    const elapsed = (tone.now() - startTime) * playbackRate;
    return Math.max(0, Math.min(startOffset + (isReversing ? -elapsed : elapsed), duration));
  };

  const updateCurrentTime = () => {
    if (!playerRef.current?.buffer.loaded || !isPlaying) return;
    setCurrentTime(currentPosition());
  };

  const resetTransport = () => {
    setStartOffset(0);
    setStartTime(0);
    setIsReversing(false);
    setPlaybackRate(1);
    setLoopA(null);
    setLoopB(null);
  };

  const handlePrev = () => {
    if (!tracks.length) return;
    void handleUserGesture();
    stopPlayback();
    resetTransport();
    const nextIndex = getRandomIndex(tracks.length, currentIndex);
    setCurrentIndex(nextIndex);
  };

  const handleNext = () => {
    if (!tracks.length) return;
    void handleUserGesture();
    stopPlayback();
    resetTransport();
    const nextIndex = getRandomIndex(tracks.length, currentIndex);
    setCurrentIndex(nextIndex);
  };

  const handleSpeed = (value: number) => {
    setPlaybackRate(value);
    if (playerRef.current) {
      playerRef.current.playbackRate = value;
    }
  };

  const handleReverseToggle = () => {
    if (!playerRef.current?.buffer.loaded || !isPlaying) return;
    void handleUserGesture();
    const position = currentPosition();
    playerRef.current.stop();
    const nextValue = !isReversing;
    setIsReversing(nextValue);
    playerRef.current.reverse = nextValue;
    const tone = toneRef.current;
    if (!tone) return;
    setStartOffset(position);
    setStartTime(tone.now());
    playerRef.current.start(tone.now(), position);
  };

  const handleMarkA = () => {
    if (!isPlaying) return;
    void handleUserGesture();
    if (loopA === null) {
      setLoopA(currentPosition());
      setLoopB(null);
      return;
    }

    setLoopA(null);
    setLoopB(null);
  };

  const handleMarkB = () => {
    if (!isPlaying || loopA === null) return;
    void handleUserGesture();
    if (loopB === null) {
      setLoopB(currentPosition());
      return;
    }

    setLoopB(null);
  };

  const startLoopWatcher = () => {
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current);
    }

    loopIntervalRef.current = setInterval(() => {
      if (!loopA || !loopB || !isPlaying || !playerRef.current) return;

      const low = Math.min(loopA, loopB);
      const high = Math.max(loopA, loopB);
      const position = currentPosition();

      if (!isReversing && position >= high) {
        handleSeek(low);
      }
      if (isReversing && position <= low) {
        handleSeek(high);
      }
    }, 120);
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
          const randomIndex = Math.floor(Math.random() * nextTracks.length);
          setCurrentIndex(randomIndex);
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
      cleanupIntervals();
      playerRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!tracks.length || !hasInteracted) return;
    void loadTrack(currentIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, tracks, hasInteracted]);

  useEffect(() => {
    cleanupIntervals();
    intervalRef.current = setInterval(updateCurrentTime, 150);

    if (loopA !== null && loopB !== null) {
      startLoopWatcher();
    }

    return () => cleanupIntervals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, loopA, loopB, playbackRate, isReversing]);

  const dotSlice = duration ? duration / NUM_DOTS : 0;
  const filledDots = dotSlice ? Math.floor(currentTime / dotSlice) : 0;
  const loopStartIndex = loopA !== null && dotSlice ? Math.floor(loopA / dotSlice) : null;
  const loopEndIndex = loopB !== null && dotSlice ? Math.floor(loopB / dotSlice) : null;

  const loopBounds =
    loopStartIndex !== null && loopEndIndex !== null
      ? {
          min: Math.min(loopStartIndex, loopEndIndex),
          max: Math.max(loopStartIndex, loopEndIndex),
        }
      : null;

  const controlsDisabled = isLoadingList || !tracks.length || !!listError;
  const statusMessage = listError
    ? listError
    : isLoadingList
      ? 'Loading tracks...'
      : !tracks.length
        ? 'No tracks available yet.'
        : trackError;

  return (
    <div className="audio-player">
      <div className="audio-player__title">
        <span>{track ? track.title : 'No track loaded'}</span>
        <span className="audio-player__artist">{track ? ARTIST_LABEL : ''}</span>
      </div>
      {statusMessage && <div className="audio-player__status">{statusMessage}</div>}
      <div className="audio-player__controls">
        <button type="button" onClick={handlePrev} disabled={controlsDisabled}>
          prev
        </button>
        <button type="button" onClick={handleTogglePlay} disabled={controlsDisabled || isLoadingTrack}>
          {isPlaying ? 'pause' : isReady && !isLoadingTrack ? 'play' : 'loading'}
        </button>
        <button type="button" onClick={handleNext} disabled={controlsDisabled}>
          next
        </button>
      </div>
      <div className="audio-player__progress">
        <div className="audio-player__dots">
          {dots.map((dot) => {
            const isActive = dot < filledDots;
            const inLoop = loopBounds && dot >= loopBounds.min && dot <= loopBounds.max;
            return (
              <button
                type="button"
                key={dot}
                className={`audio-player__dot ${isActive ? 'active' : ''} ${
                  inLoop ? 'loop' : ''
                }`}
                onClick={() => {
                  void handleSeek(dotSlice * (dot + 0.5));
                }}
                aria-label={`Seek ${dot}`}
                disabled={controlsDisabled}
              />
            );
          })}
        </div>
        <div className="audio-player__time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
      <button
        type="button"
        className="audio-player__toggle"
        onClick={() => setControlsOpen((open) => !open)}
        disabled={controlsDisabled}
      >
        ctrl
      </button>

      {controlsOpen && (
        <div className="audio-player__panel">
          <div className="audio-player__speed">
            <div className="audio-player__speed-labels">
              <span>0.5x</span>
              <span>1.0x</span>
              <span>2.0x</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={playbackRate}
              onChange={(event) => handleSpeed(Number(event.target.value))}
              disabled={controlsDisabled}
            />
          </div>
          <div className="audio-player__bottom">
            <button
              type="button"
              onClick={handleReverseToggle}
              className={isReversing ? 'active' : ''}
              disabled={controlsDisabled}
            >
              reverse
            </button>
            <div className="audio-player__ab">
              <button
                type="button"
                onClick={handleMarkA}
                className={loopA !== null ? 'active' : ''}
                disabled={controlsDisabled}
              >
                a
              </button>
              <button
                type="button"
                onClick={handleMarkB}
                className={loopB !== null ? 'active' : ''}
                disabled={controlsDisabled}
              >
                b
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
