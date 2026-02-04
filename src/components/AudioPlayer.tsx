'use client';

import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';

import { useWebPlayer } from '@/hooks/useWebPlayer';
import { formatTime } from '@/lib/format';

const ARTIST_LABEL = 'thx4cmn';
const DOT_COUNT = 24;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const AudioPlayer = () => {
  const { state, currentTrack, statusMessage, controlsDisabled, actions } = useWebPlayer();
  const {
    handlePlayToggle,
    handlePrev,
    handleNext,
    handleSeek,
    handlePlaybackRate,
    handleReverseToggle,
  } = actions;
  const [gradientPosition, setGradientPosition] = useState({ x: 50, y: 50 });
  const [isDspOpen, setIsDspOpen] = useState(false);

  const safeDuration = Number.isFinite(state.duration) ? state.duration : 0;
  const safeCurrentTime = Number.isFinite(state.currentTime) ? state.currentTime : 0;
  const progress = safeDuration ? clamp(safeCurrentTime / safeDuration, 0, 1) : 0;

  const dotPositions = useMemo(
    () => Array.from({ length: DOT_COUNT }, (_, index) => (index + 0.5) / DOT_COUNT),
    [],
  );
  const activeIndex = safeDuration
    ? clamp(Math.floor(progress * DOT_COUNT), 0, DOT_COUNT - 1)
    : 0;

  const isLoading = state.status === 'loading-list' || state.status === 'loading-track';
  const rpmSliderValue = useMemo(() => {
    const downRange = 1 - 0.35;
    const upRange = 2.35 - 1;
    if (state.playbackRate === 1) return 0.5;
    if (state.playbackRate > 1) {
      const magnitude = Math.sqrt((state.playbackRate - 1) / upRange);
      return clamp(0.5 + magnitude * 0.5, 0, 1);
    }
    const magnitude = Math.sqrt((1 - state.playbackRate) / downRange);
    return clamp(0.5 - magnitude * 0.5, 0, 1);
  }, [state.playbackRate]);
  const rpmProgress = clamp(rpmSliderValue, 0, 1);
  const mapSliderToRate = (value: number) => {
    const centered = value - 0.5;
    if (!centered) return 1;
    const magnitude = Math.min(Math.abs(centered) / 0.5, 1);
    const curved = magnitude ** 2;
    if (centered < 0) {
      return 1 - (1 - 0.35) * curved;
    }
    return 1 + (2.35 - 1) * curved;
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    setGradientPosition({ x, y });
  };

  const handleMouseLeave = () => {
    setGradientPosition({ x: 50, y: 50 });
  };

  return (
    <div
      className={`audio-player ${isDspOpen ? 'audio-player--expanded' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        '--gradient-x': `${gradientPosition.x}%`,
        '--gradient-y': `${gradientPosition.y}%`,
      } as CSSProperties}
    >
      <div className="audio-player__title">
        <span>{currentTrack ? currentTrack.title : 'No track loaded'}</span>
        <span className="audio-player__artist">{currentTrack ? ARTIST_LABEL : ''}</span>
      </div>
      {statusMessage && <div className="audio-player__status">{statusMessage}</div>}
      <div className="audio-player__controls">
        <button type="button" onClick={handlePrev} disabled={controlsDisabled}>
          prev
        </button>
        <button type="button" onClick={handlePlayToggle} disabled={controlsDisabled || isLoading}>
          {state.isPlaying ? 'pause' : 'play'}
        </button>
        <button type="button" onClick={handleNext} disabled={controlsDisabled}>
          next
        </button>
      </div>
      <div className="audio-player__progress">
        <div className="audio-player__dots" role="list">
          {dotPositions.map((position, index) => {
            const isActive = index <= activeIndex && safeDuration > 0;
            const seekTarget = safeDuration * position;
            return (
              <button
                type="button"
                key={position}
                className={`audio-player__dot ${isActive ? 'active' : ''}`}
                onClick={() => handleSeek(seekTarget)}
                aria-label={`Seek to ${Math.round(position * 100)}%`}
                disabled={controlsDisabled || !safeDuration}
              />
            );
          })}
        </div>
        <div className="audio-player__time">
          {formatTime(safeCurrentTime)} / {formatTime(safeDuration)}
        </div>
      </div>
      <div className="audio-player__dsp-toggle">
        <button
          type="button"
          className="audio-player__dsp-toggle-button"
          onClick={() => setIsDspOpen((prev) => !prev)}
          aria-expanded={isDspOpen}
          aria-controls="audio-player-dsp"
        >
          ctrl
        </button>
      </div>
      {isDspOpen && (
        <div className="audio-player__dsp" id="audio-player-dsp">
          <div className="audio-player__dsp-header">
            <span className="audio-player__dsp-label">rpm</span>
            <span className="audio-player__dsp-value">{state.playbackRate.toFixed(2)}x</span>
          </div>
          <div className="audio-player__rpm">
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={rpmSliderValue}
              className="audio-player__rpm-slider"
              onChange={(event) => handlePlaybackRate(mapSliderToRate(Number(event.target.value)))}
              aria-label="Record RPM"
              style={{ '--rpm-progress': rpmProgress } as CSSProperties}
            />
            <div className="audio-player__rpm-marks">
              <span>0.5</span>
              <span>1.0</span>
              <span>2.0</span>
            </div>
          </div>
          <button
            type="button"
            className={`audio-player__reverse-button ${state.isReversed ? 'active' : ''}`}
            onClick={handleReverseToggle}
            disabled={controlsDisabled || isLoading}
            aria-pressed={state.isReversed}
          >
            reverse
          </button>
        </div>
      )}
    </div>
  );
};
