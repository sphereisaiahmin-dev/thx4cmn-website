'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { useWebPlayer } from '@/hooks/useWebPlayer';
import { formatTime } from '@/lib/format';
import { useUiStore } from '@/store/ui';

const ARTIST_LABEL = 'thx4cmn';
const DOT_COUNT = 24;
const WEATHER_REFRESH_MS = 10 * 60 * 1000;
const WEATHER_CLOCK_TICK_MS = 30_000;
const WEATHER_ERROR_MESSAGE = 'Weather unavailable.';
const DESKTOP_WEATHER_TOP = 106;
const DESKTOP_WIDGET_GAP = 12;

type WeatherCondition = 'sunny' | 'cloudy' | 'rainy' | 'snowy';

type WeatherPayload = {
  location: string;
  countryCode: string;
  condition: WeatherCondition;
  conditionLabel: string;
  tempF: number;
  tempC: number;
  timezoneOffsetSeconds: number;
  observationUnix: number;
};

type WeatherCoordinates = {
  lat: number;
  lon: number;
};

type WeatherState = {
  status: 'loading' | 'ready' | 'error';
  data: WeatherPayload | null;
  error: string | null;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isWeatherCondition = (value: unknown): value is WeatherCondition =>
  value === 'sunny' || value === 'cloudy' || value === 'rainy' || value === 'snowy';

const isWeatherPayload = (value: unknown): value is WeatherPayload => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WeatherPayload>;
  return (
    typeof candidate.location === 'string' &&
    typeof candidate.countryCode === 'string' &&
    isWeatherCondition(candidate.condition) &&
    typeof candidate.conditionLabel === 'string' &&
    isFiniteNumber(candidate.tempF) &&
    isFiniteNumber(candidate.tempC) &&
    isFiniteNumber(candidate.timezoneOffsetSeconds) &&
    isFiniteNumber(candidate.observationUnix)
  );
};

const formatWeatherTime = (timezoneOffsetSeconds: number, nowUnixMs: number) => {
  const shiftedTime = new Date(nowUnixMs + timezoneOffsetSeconds * 1000);
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(shiftedTime);
};

const formatCountryName = (countryCode: string) => {
  const normalizedCode = countryCode.trim().toUpperCase();
  if (!normalizedCode) return 'Location';
  if (typeof Intl.DisplayNames === 'undefined') return normalizedCode;
  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
    return displayNames.of(normalizedCode) ?? normalizedCode;
  } catch {
    return normalizedCode;
  }
};

const WeatherIcon = ({ condition }: { condition: WeatherCondition }) => {
  switch (condition) {
    case 'sunny':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="audio-weather-icon">
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4" />
        </svg>
      );
    case 'rainy':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="audio-weather-icon">
          <path d="M5.6 11.3h5.4a2.5 2.5 0 0 0 0-5 3.5 3.5 0 0 0-6.7-.7A2.7 2.7 0 0 0 5.6 11.3Z" />
          <path d="M5.8 12.6v2M8 12.6v2M10.2 12.6v2" />
        </svg>
      );
    case 'snowy':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="audio-weather-icon">
          <path d="M5.6 10.9h5.4a2.5 2.5 0 0 0 0-5 3.5 3.5 0 0 0-6.7-.7A2.7 2.7 0 0 0 5.6 10.9Z" />
          <path d="M5.5 13.2h1.2M6.1 12.6v1.2M8.7 13.2h1.2M9.3 12.6v1.2" />
        </svg>
      );
    case 'cloudy':
    default:
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="audio-weather-icon">
          <path d="M5.2 11.3h6.1a2.3 2.3 0 1 0-.2-4.6 3.3 3.3 0 0 0-6.3-.9A2.5 2.5 0 0 0 5.2 11.3Z" />
        </svg>
      );
  }
};

const WeatherReadout = ({
  weatherState,
  weatherTimeLabel,
}: {
  weatherState: WeatherState;
  weatherTimeLabel: string;
}) => {
  if (!weatherState.data) {
    if (weatherState.status === 'loading') {
      return <div className="audio-weather__status">Loading weather...</div>;
    }
    return <div className="audio-weather__status">{weatherState.error ?? WEATHER_ERROR_MESSAGE}</div>;
  }

  return (
    <>
      <div className="audio-weather__summary">
        <WeatherIcon condition={weatherState.data.condition} />
        <div className="audio-weather__summary-text">
          <span className="audio-weather__location">{weatherState.data.location}</span>
          <span className="audio-weather__time">{weatherTimeLabel}</span>
        </div>
      </div>
      <div className="audio-weather__meta">
        <span className="audio-weather__condition">{weatherState.data.conditionLabel}</span>
        <span className="audio-weather__temp">{`${weatherState.data.tempF.toFixed(1)}F / ${weatherState.data.tempC.toFixed(1)}C`}</span>
      </div>
      {weatherState.status === 'error' ? (
        <div className="audio-weather__status">Live update unavailable.</div>
      ) : null}
    </>
  );
};

const WeatherCollapsedSummary = ({
  condition,
  countryName,
  weatherTimeLabel,
}: {
  condition: WeatherCondition;
  countryName: string;
  weatherTimeLabel: string;
}) => (
  <div className="audio-weather__collapsed-summary">
    <WeatherIcon condition={condition} />
    <span className="audio-weather__collapsed-country">{countryName}</span>
    <span className="audio-weather__collapsed-time">{weatherTimeLabel}</span>
  </div>
);

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
  const [isMobile, setIsMobile] = useState(false);
  const [isDspOpen, setIsDspOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDesktopWeatherCollapsed, setIsDesktopWeatherCollapsed] = useState(false);
  const [titleOverflowWidth, setTitleOverflowWidth] = useState(0);
  const [weatherCoordinates, setWeatherCoordinates] = useState<WeatherCoordinates | null>(null);
  const [isWeatherLocationResolved, setIsWeatherLocationResolved] = useState(false);
  const [weatherClockMs, setWeatherClockMs] = useState(() => Date.now());
  const [desktopWeatherHeight, setDesktopWeatherHeight] = useState(110);
  const [weatherState, setWeatherState] = useState<WeatherState>({
    status: 'loading',
    data: null,
    error: null,
  });

  const playerRef = useRef<HTMLDivElement | null>(null);
  const weatherCardRef = useRef<HTMLElement | null>(null);
  const titleViewportRef = useRef<HTMLSpanElement | null>(null);
  const titleTextRef = useRef<HTMLSpanElement | null>(null);
  const isMobileCompact = isMobile && !isHome;
  const isDspVisible = isDspOpen && !isCollapsed && !isMobileCompact;
  const currentTrackTitle = currentTrack?.title ?? null;

  const safeDuration = Number.isFinite(state.duration) ? state.duration : 0;
  const safeCurrentTime = Number.isFinite(state.currentTime) ? state.currentTime : 0;
  const progress = safeDuration ? clamp(safeCurrentTime / safeDuration, 0, 1) : 0;
  const weatherLatitude = weatherCoordinates?.lat ?? null;
  const weatherLongitude = weatherCoordinates?.lon ?? null;

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

  const fetchWeather = useCallback(async (coordinates: WeatherCoordinates | null) => {
    setWeatherState((previous) =>
      previous.data
        ? {
            ...previous,
            error: null,
          }
        : {
            status: 'loading',
            data: null,
            error: null,
          },
    );

    const query = new URLSearchParams();
    if (coordinates) {
      query.set('lat', coordinates.lat.toString());
      query.set('lon', coordinates.lon.toString());
    }

    const endpoint = query.size ? `/api/weather/current?${query.toString()}` : '/api/weather/current';

    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) {
        let errorMessage = `Weather request failed (${response.status}).`;
        try {
          const errorPayload = (await response.json()) as { error?: unknown };
          if (typeof errorPayload.error === 'string' && errorPayload.error.trim()) {
            errorMessage = errorPayload.error.trim();
          }
        } catch {
          // keep fallback status-based message when response body is not JSON
        }
        throw new Error(errorMessage);
      }

      const payload = (await response.json()) as unknown;
      if (!isWeatherPayload(payload)) {
        throw new Error('Weather payload format is invalid.');
      }

      setWeatherState({
        status: 'ready',
        data: payload,
        error: null,
      });
    } catch (error) {
      console.error('[AudioPlayer] Weather fetch failed.', error);
      setWeatherState((previous) => ({
        status: 'error',
        data: previous.data,
        error: error instanceof Error && error.message ? error.message : WEATHER_ERROR_MESSAGE,
      }));
    }
  }, []);

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
    if (typeof window === 'undefined') return;

    if (!('geolocation' in navigator)) {
      setIsWeatherLocationResolved(true);
      return;
    }

    let isCanceled = false;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (isCanceled) return;
        setWeatherCoordinates({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
        setIsWeatherLocationResolved(true);
      },
      () => {
        if (isCanceled) return;
        setWeatherCoordinates(null);
        setIsWeatherLocationResolved(true);
      },
      {
        enableHighAccuracy: false,
        timeout: 7000,
        maximumAge: 10 * 60 * 1000,
      },
    );

    return () => {
      isCanceled = true;
    };
  }, []);

  useEffect(() => {
    if (!isWeatherLocationResolved) return;

    const coordinates =
      weatherLatitude !== null && weatherLongitude !== null
        ? { lat: weatherLatitude, lon: weatherLongitude }
        : null;

    void fetchWeather(coordinates);
    const intervalId = window.setInterval(() => {
      void fetchWeather(coordinates);
    }, WEATHER_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchWeather, isWeatherLocationResolved, weatherLatitude, weatherLongitude]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const intervalId = window.setInterval(() => {
      setWeatherClockMs(Date.now());
    }, WEATHER_CLOCK_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
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
    setIsDesktopWeatherCollapsed(!isHome);
  }, [isHome, pathname]);

  useEffect(() => {
    if (typeof window === 'undefined' || isMobile) return;

    const weatherElement = weatherCardRef.current;
    if (!weatherElement) return;

    const updateDesktopWeatherHeight = () => {
      const height = Math.ceil(weatherElement.getBoundingClientRect().height);
      if (height > 0) {
        setDesktopWeatherHeight(height);
      }
    };

    updateDesktopWeatherHeight();
    const rafId = window.requestAnimationFrame(updateDesktopWeatherHeight);
    window.addEventListener('resize', updateDesktopWeatherHeight);

    const fontSet = document.fonts;
    const handleFontsReady = () => updateDesktopWeatherHeight();
    fontSet.ready.then(handleFontsReady).catch(() => {
      // ignore font loading failures and keep current measurement
    });
    if (typeof fontSet.addEventListener === 'function') {
      fontSet.addEventListener('loadingdone', handleFontsReady);
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateDesktopWeatherHeight);
      resizeObserver.observe(weatherElement);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateDesktopWeatherHeight);
      if (typeof fontSet.removeEventListener === 'function') {
        fontSet.removeEventListener('loadingdone', handleFontsReady);
      }
      resizeObserver?.disconnect();
    };
  }, [isMobile, isDesktopWeatherCollapsed]);

  useEffect(() => {
    if (isMobile && !isHome && isDspOpen) {
      setIsDspOpen(false);
    }
  }, [isDspOpen, isHome, isMobile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateOverflow = () => {
      const titleViewport = titleViewportRef.current;
      const titleText = titleTextRef.current;
      if (!titleViewport || !titleText) {
        setTitleOverflowWidth(0);
        return;
      }
      const viewportWidth = Math.max(titleViewport.clientWidth, 0);
      if (!viewportWidth) {
        setTitleOverflowWidth(0);
        return;
      }
      const textWidth = Math.max(titleText.scrollWidth, 0);
      const overflow = Math.max(textWidth - viewportWidth, 0);
      setTitleOverflowWidth(overflow > 1 ? overflow : 0);
    };

    updateOverflow();
    const firstRafId = window.requestAnimationFrame(updateOverflow);
    const secondRafId = window.requestAnimationFrame(() => updateOverflow());
    window.addEventListener('resize', updateOverflow);

    const fontSet = document.fonts;
    const handleFontsReady = () => updateOverflow();
    fontSet.ready.then(handleFontsReady).catch(() => {
      // ignore font loading failures and keep current measurement
    });
    if (typeof fontSet.addEventListener === 'function') {
      fontSet.addEventListener('loadingdone', handleFontsReady);
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateOverflow);
      if (titleViewportRef.current) {
        resizeObserver.observe(titleViewportRef.current);
      }
    }

    return () => {
      window.cancelAnimationFrame(firstRafId);
      window.cancelAnimationFrame(secondRafId);
      window.removeEventListener('resize', updateOverflow);
      if (typeof fontSet.removeEventListener === 'function') {
        fontSet.removeEventListener('loadingdone', handleFontsReady);
      }
      resizeObserver?.disconnect();
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

  const isTitleOverflowing = titleOverflowWidth > 0;
  const weatherTimeLabel = useMemo(() => {
    if (!weatherState.data) return '--:--';
    return formatWeatherTime(weatherState.data.timezoneOffsetSeconds, weatherClockMs);
  }, [weatherClockMs, weatherState.data]);
  const weatherCountryName = useMemo(() => {
    if (!weatherState.data?.countryCode) return 'Location';
    return formatCountryName(weatherState.data.countryCode);
  }, [weatherState.data?.countryCode]);
  const weatherTemperatureLabel = useMemo(() => {
    if (!weatherState.data) return '--F / --C';
    return `${weatherState.data.tempF.toFixed(1)}F / ${weatherState.data.tempC.toFixed(1)}C`;
  }, [weatherState.data]);
  const desktopAudioTop = useMemo(
    () => DESKTOP_WEATHER_TOP + desktopWeatherHeight + DESKTOP_WIDGET_GAP,
    [desktopWeatherHeight],
  );

  return (
    <>
      {!isMobile ? (
        <section
          ref={weatherCardRef}
          className={`audio-weather-card ${isHome ? 'audio-weather-card--home' : 'audio-weather-card--offhome'} ${
            isDesktopWeatherCollapsed ? 'audio-weather-card--collapsed' : ''
          } ${isMiniCartOpen ? 'audio-weather-card--hidden' : ''}`}
          style={{ top: `${DESKTOP_WEATHER_TOP}px` }}
        >
          <div className="audio-weather-card__header">
            <span className="audio-weather-card__title">weather</span>
            <div className="audio-weather-card__header-actions">
              {isDesktopWeatherCollapsed ? (
                <span className="audio-weather-card__header-temp">{weatherTemperatureLabel}</span>
              ) : null}
              <button
                type="button"
                className="audio-weather-card__collapse-button"
                onClick={() => setIsDesktopWeatherCollapsed((previous) => !previous)}
                data-collapsed={isDesktopWeatherCollapsed}
                aria-expanded={!isDesktopWeatherCollapsed}
                aria-label={isDesktopWeatherCollapsed ? 'Expand weather' : 'Collapse weather'}
              >
                {'<>'}
              </button>
            </div>
          </div>
          <div className="audio-weather-card__content" aria-hidden={isDesktopWeatherCollapsed}>
            <WeatherReadout weatherState={weatherState} weatherTimeLabel={weatherTimeLabel} />
          </div>
          {isDesktopWeatherCollapsed ? (
            <div className="audio-weather-card__collapsed-content" aria-hidden={!isDesktopWeatherCollapsed}>
              <WeatherCollapsedSummary
                condition={weatherState.data?.condition ?? 'cloudy'}
                countryName={weatherCountryName}
                weatherTimeLabel={weatherTimeLabel}
              />
            </div>
          ) : null}
        </section>
      ) : null}
      <div
        ref={playerRef}
        className={`audio-player ${isHome ? 'audio-player--home' : 'audio-player--offhome'} ${
          isDspOpen ? 'audio-player--expanded' : ''
        } ${isCollapsed ? 'audio-player--collapsed' : ''} ${isMiniCartOpen ? 'audio-player--hidden' : ''} ${
          isMobile ? 'audio-player--mobile' : 'audio-player--desktop'
        } ${isMobileCompact ? 'audio-player--mobile-compact' : 'audio-player--mobile-full'}`}
        style={!isMobile ? ({ top: `${desktopAudioTop}px` } as CSSProperties) : undefined}
      >
        <div className="audio-player__header">
          <div className="audio-player__title">
            <span ref={titleViewportRef} className="audio-player__track-title">
              <span
                ref={titleTextRef}
                className={`audio-player__track-title-text ${
                  isTitleOverflowing ? 'audio-player__track-title-text--marquee' : ''
                }`}
                style={
                  isTitleOverflowing
                    ? ({ '--title-overflow-distance': `${titleOverflowWidth}px` } as CSSProperties)
                    : undefined
                }
              >
                {currentTrack ? currentTrack.title : 'No track loaded'}
              </span>
            </span>
            <span className="audio-player__artist">{currentTrack ? ARTIST_LABEL : ''}</span>
          </div>
          {isMobileCompact ? (
            <div className="audio-weather-mobile-badge" aria-label={`Weather ${weatherTemperatureLabel}`}>
              <WeatherIcon condition={weatherState.data?.condition ?? 'cloudy'} />
              <span className="audio-weather-mobile-badge__temp">{weatherTemperatureLabel}</span>
            </div>
          ) : null}
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
        <div className="audio-player__details" aria-hidden={isCollapsed || isMobileCompact}>
          {isMobile && isHome ? (
            <div className="audio-weather-inline" id="audio-player-weather">
              <WeatherReadout weatherState={weatherState} weatherTimeLabel={weatherTimeLabel} />
            </div>
          ) : null}
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
                  index > loopSectionStart &&
                  index < loopSectionEnd;
                return (
                  <button
                    type="button"
                    key={index}
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
      </div>
    </>
  );
};
