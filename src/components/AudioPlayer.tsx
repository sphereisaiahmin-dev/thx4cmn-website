'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { useWebPlayer } from '@/hooks/useWebPlayer';
import { formatTime } from '@/lib/format';
import { useUiStore } from '@/store/ui';

const ARTIST_LABEL = 'thx4cmn';
const DOT_COUNT = 24;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const AudioPlayer = () => {
  const isMiniCartOpen = useUiStore((state) => state.isMiniCartOpen);
  const setNowPlaying = useUiStore((state) => state.setNowPlaying);
  const { state, currentTrack, statusMessage, controlsDisabled, actions } = useWebPlayer();
  const pathname = usePathname();
  const isHome = pathname === '/';
  const {
    handlePlayToggle,
    handlePrev,
    handleNext,
    handleSeek,
    handlePlaybackRate,
    handleReverseToggle,
    handleLoopStartToggle,
    handleLoopEndToggle,
  } = actions;
  const [gradientPosition, setGradientPosition] = useState({ x: 50, y: 50 });
  const [isMobile, setIsMobile] = useState(false);
  const [isDspOpen, setIsDspOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [loopSyncNonce, setLoopSyncNonce] = useState(0);
  const [titleOverflowWidth, setTitleOverflowWidth] = useState(0);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLSpanElement | null>(null);
  const isMobileCompact = isMobile && !isHome;
  const showsFullMobileControls = !isMobileCompact;
  const isDspVisible = isDspOpen && !isCollapsed && showsFullMobileControls;
  const currentTrackTitle = currentTrack?.title ?? null;

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
  const loopStartIndex =
    state.loopStart !== null && safeDuration
      ? clamp(Math.floor((state.loopStart / safeDuration) * DOT_COUNT), 0, DOT_COUNT - 1)
      : null;
  const loopEndIndex =
    state.loopEnd !== null && safeDuration
      ? clamp(Math.floor((state.loopEnd / safeDuration) * DOT_COUNT), 0, DOT_COUNT - 1)
      : null;
  const loopSectionStart =
    loopStartIndex !== null && loopEndIndex !== null ? Math.min(loopStartIndex, loopEndIndex) : null;
  const loopSectionEnd =
    loopStartIndex !== null && loopEndIndex !== null ? Math.max(loopStartIndex, loopEndIndex) : null;

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

  useEffect(() => {
    if (state.loopStart === null || state.loopEnd === null) {
      return;
    }
    setLoopSyncNonce((prev) => prev + 1);
  }, [state.loopEnd, state.loopStart]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const syncMobileState = (matches: boolean) => {
      setIsMobile(matches);
    };

    syncMobileState(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      syncMobileState(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (!currentTrackTitle) {
      setNowPlaying(null, 'idle');
      return;
    }
    setNowPlaying(currentTrackTitle, state.isPlaying ? 'playing' : 'paused');
  }, [currentTrackTitle, setNowPlaying, state.isPlaying]);

  useEffect(() => {
    if (isMobile) {
      setIsCollapsed(false);
      return;
    }
    setIsCollapsed(!isHome);
  }, [isHome, isMobile, pathname]);

  useEffect(() => {
    if (isMobile && !isHome && isDspOpen) {
      setIsDspOpen(false);
    }
  }, [isDspOpen, isHome, isMobile]);

  useEffect(() => {
    if (!isMobile) {
      setTitleOverflowWidth(0);
      return;
    }

    const updateOverflow = () => {
      const titleElement = titleRef.current;
      if (!titleElement) {
        setTitleOverflowWidth(0);
        return;
      }
      const overflow = Math.max(titleElement.scrollWidth - titleElement.clientWidth, 0);
      setTitleOverflowWidth(overflow > 1 ? overflow : 0);
    };

    updateOverflow();
    window.addEventListener('resize', updateOverflow);
    return () => {
      window.removeEventListener('resize', updateOverflow);
    };
  }, [currentTrackTitle, isCollapsed, isHome, isMobile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!isMobile) {
      document.documentElement.style.setProperty('--mobile-player-offset', '0px');
      return;
    }

    const playerElement = playerRef.current;
    if (!playerElement) return;

    const updateOffset = () => {
      const height = Math.ceil(playerElement.getBoundingClientRect().height);
      const offset = isMiniCartOpen ? 0 : height + 16;
      document.documentElement.style.setProperty('--mobile-player-offset', `${offset}px`);
    };

    updateOffset();
    window.addEventListener('resize', updateOffset);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateOffset);
      resizeObserver.observe(playerElement);
    }

    return () => {
      window.removeEventListener('resize', updateOffset);
      resizeObserver?.disconnect();
    };
  }, [isDspOpen, isHome, isMiniCartOpen, isMobile]);

  const isTitleOverflowing = isMobile && titleOverflowWidth > 0;

  return (
    <div
      ref={playerRef}
      className={`audio-player ${isHome ? 'audio-player--home' : 'audio-player--offhome'} ${
        isDspOpen ? 'audio-player--expanded' : ''
      } ${isCollapsed ? 'audio-player--collapsed' : ''} ${isMiniCartOpen ? 'audio-player--hidden' : ''} ${
        isMobile ? 'audio-player--mobile' : 'audio-player--desktop'
      } ${isMobileCompact ? 'audio-player--mobile-compact' : 'audio-player--mobile-full'}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        '--gradient-x': `${gradientPosition.x}%`,
        '--gradient-y': `${gradientPosition.y}%`,
      } as CSSProperties}
    >
      <div className="audio-player__header">
        <div className="audio-player__title">
          <span
            ref={titleRef}
            className={`audio-player__track-title ${isTitleOverflowing ? 'audio-player__track-title--marquee' : ''}`}
            style={
              isTitleOverflowing
                ? ({ '--title-overflow-distance': `${titleOverflowWidth}px` } as CSSProperties)
                : undefined
            }
          >
            {currentTrack ? currentTrack.title : 'No track loaded'}
          </span>
          <span className="audio-player__artist">{currentTrack ? ARTIST_LABEL : ''}</span>
        </div>
        {!isMobile ? (
          <button
            type="button"
            className="audio-player__collapse-button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            data-collapsed={isCollapsed}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand player' : 'Collapse player'}
          >
            {'<>'}
          </button>
        ) : null}
      </div>
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
      {showsFullMobileControls ? (
        <div className="audio-player__details" aria-hidden={isCollapsed}>
          {statusMessage && <div className="audio-player__status">{statusMessage}</div>}
          <div className="audio-player__progress">
            <div className="audio-player__dots" role="list">
              {dotPositions.map((position, index) => {
                const isActive = index <= activeIndex && safeDuration > 0;
                const seekTarget = safeDuration * position;
                const isLoopStart = loopStartIndex === index;
                const isLoopEnd = loopEndIndex === index;
                const isLoopSection =
                  loopSectionStart !== null &&
                  loopSectionEnd !== null &&
                  index >= loopSectionStart &&
                  index <= loopSectionEnd;
                return (
                  <button
                    type="button"
                    key={
                      isLoopSection || isLoopStart || isLoopEnd
                        ? `${position}-${loopSyncNonce}`
                        : `${position}`
                    }
                    className={`audio-player__dot ${isActive ? 'active' : ''} ${
                      isLoopSection ? 'loop-section' : ''
                    } ${
                      isLoopStart && isLoopEnd
                        ? 'loop-marker loop-marker--both'
                        : isLoopStart
                        ? 'loop-marker loop-marker--start'
                        : isLoopEnd
                        ? 'loop-marker loop-marker--end'
                        : ''
                    }`}
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
          <div
            className={`audio-player__dsp ${isDspVisible ? 'is-open' : ''}`}
            id="audio-player-dsp"
            aria-hidden={!isDspVisible}
          >
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
            <div className="audio-player__transport-controls">
              <button
                type="button"
                className={`audio-player__reverse-button ${state.isReversed ? 'active' : ''}`}
                onClick={handleReverseToggle}
                disabled={controlsDisabled || isLoading}
                aria-pressed={state.isReversed}
              >
                reverse
              </button>
              <div className="audio-player__loop-controls" aria-label="Loop controls">
                <button
                  type="button"
                  className={`audio-player__loop-button ${state.loopStart !== null ? 'active' : ''}`}
                  onClick={handleLoopStartToggle}
                  disabled={controlsDisabled || !safeDuration}
                  aria-pressed={state.loopStart !== null}
                  aria-label="Set loop start"
                >
                  [
                </button>
                <button
                  type="button"
                  className={`audio-player__loop-button ${state.loopEnd !== null ? 'active' : ''}`}
                  onClick={handleLoopEndToggle}
                  disabled={controlsDisabled || !safeDuration}
                  aria-pressed={state.loopEnd !== null}
                  aria-label="Set loop end"
                >
                  ]
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
