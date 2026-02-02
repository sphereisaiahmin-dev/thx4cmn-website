'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { playlist } from '@/data/playlist';
import { formatTime } from '@/lib/format';

type ToneModule = typeof import('tone');

const NUM_DOTS = 20;

export const AudioPlayer = () => {
  const toneRef = useRef<ToneModule | null>(null);
  const playerRef = useRef<import('tone').Player | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const loopIntervalRef = useRef<NodeJS.Timeout | null>(null);
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

  const track = playlist[currentIndex];
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
    if (!toneRef.current) {
      toneRef.current = await import('tone');
    }
  };

  const loadTrack = async (index: number) => {
    await loadTone();
    const tone = toneRef.current;
    if (!tone) return;
    setIsReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLoopA(null);
    setLoopB(null);

    if (playerRef.current) {
      playerRef.current.dispose();
    }

    const next = playlist[index];
    const player = new tone.Player({
      url: next.url,
      loop: false,
      reverse: false,
      autostart: false,
      crossOrigin: 'anonymous',
      onload: () => {
        setDuration(player.buffer.duration);
        setIsReady(true);
      },
      onerror: (error) => {
        console.error('Audio load failed', error);
        setIsReady(false);
      },
    }).toDestination();

    playerRef.current = player;
    try {
      await player.load(next.url);
    } catch (error) {
      console.error('Audio load failed', error);
      setIsReady(false);
    }
  };

  const ensureAudioContext = async () => {
    await loadTone();
    const tone = toneRef.current;
    if (!tone) return;
    if (tone.getContext().state !== 'running') {
      await tone.start();
    }
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
    const position = currentPosition();
    playerRef.current?.stop();
    setStartOffset(position);
    setIsPlaying(false);
  };

  const handleTogglePlay = async () => {
    if (!playerRef.current?.buffer.loaded) return;

    if (isPlaying) {
      stopPlayback();
    } else {
      await startPlayback();
    }
  };

  const handleSeek = (position: number) => {
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

  const handlePrev = async () => {
    const nextIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    resetTransport();
    setCurrentIndex(nextIndex);
    await loadTrack(nextIndex);
  };

  const handleNext = async () => {
    const nextIndex = (currentIndex + 1) % playlist.length;
    resetTransport();
    setCurrentIndex(nextIndex);
    await loadTrack(nextIndex);
  };

  const handleSpeed = (value: number) => {
    setPlaybackRate(value);
    if (playerRef.current) {
      playerRef.current.playbackRate = value;
    }
  };

  const handleReverseToggle = () => {
    if (!playerRef.current?.buffer.loaded || !isPlaying) return;
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
    loadTrack(currentIndex);

    return () => {
      cleanupIntervals();
      playerRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="audio-player">
      <div className="audio-player__title">
        <span>{track.title}</span>
        <span className="audio-player__artist">{track.artist}</span>
      </div>
      <div className="audio-player__controls">
        <button type="button" onClick={handlePrev}>
          prev
        </button>
        <button type="button" onClick={handleTogglePlay}>
          {isPlaying ? 'pause' : isReady ? 'play' : 'loading'}
        </button>
        <button type="button" onClick={handleNext}>
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
                onClick={() => handleSeek(dotSlice * (dot + 0.5))}
                aria-label={`Seek ${dot}`}
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
            />
          </div>
          <div className="audio-player__bottom">
            <button type="button" onClick={handleReverseToggle} className={isReversing ? 'active' : ''}>
              reverse
            </button>
            <div className="audio-player__ab">
              <button type="button" onClick={handleMarkA} className={loopA !== null ? 'active' : ''}>
                a
              </button>
              <button type="button" onClick={handleMarkB} className={loopB !== null ? 'active' : ''}>
                b
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
