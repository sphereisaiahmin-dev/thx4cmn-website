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
  const { handlePlayToggle, handlePrev, handleNext, handleSeek, handleSetPlaybackRate } = actions;
  const [gradientPosition, setGradientPosition] = useState({ x: 50, y: 50 });
  const [showDsp, setShowDsp] = useState(false);
  const [rpmValue, setRpmValue] = useState(0);

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

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    setGradientPosition({ x, y });
  };

  const handleMouseLeave = () => {
    setGradientPosition({ x: 50, y: 50 });
  };

  const normalizedRpm = clamp((rpmValue + 1) * 50, 0, 100);
  const playbackRate = rpmValue < 0 ? 1 + rpmValue * 0.5 : 1 + rpmValue;

  const handleRpmChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    setRpmValue(value);
    handleSetPlaybackRate(value < 0 ? 1 + value * 0.5 : 1 + value);
  };

  return (
    <div className="audio-player__stack">
      <div
        className="audio-player"
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
        <button
          type="button"
          className="audio-player__ctrl-button"
          onClick={() => setShowDsp((prev) => !prev)}
          aria-pressed={showDsp}
        >
          ctrl
        </button>
      </div>
      {showDsp && (
        <div className="audio-player__dsp">
          <div className="audio-player__dsp-header">dsp</div>
          <div className="audio-player__dsp-control">
            <label className="audio-player__dsp-label" htmlFor="rpm-slider">
              rpm
            </label>
            <input
              id="rpm-slider"
              className="audio-player__dsp-slider"
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={rpmValue}
              onChange={handleRpmChange}
              style={{ '--rpm-gradient-position': `${normalizedRpm}%` } as CSSProperties}
            />
            <div className="audio-player__dsp-metrics">
              <span>0.5</span>
              <span>{playbackRate.toFixed(1)}</span>
              <span>2.0</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
