'use client';

import { formatTime } from '@/lib/format';
import { useWebPlayer } from '@/hooks/useWebPlayer';

const ARTIST_LABEL = 'thx4cmn';

export const AudioPlayer = () => {
  const { state, currentTrack, statusMessage, controlsDisabled, actions } = useWebPlayer();
  const { handlePlayToggle, handlePrev, handleNext, handleSeek } = actions;

  const isLoading = state.status === 'loading-list' || state.status === 'loading-track';
  const seekMax = state.duration || 0;

  return (
    <div className="audio-player">
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
        <input
          className="audio-player__scrub"
          type="range"
          min={0}
          max={seekMax}
          step={0.1}
          value={state.currentTime}
          onChange={(event) => handleSeek(Number(event.target.value))}
          disabled={controlsDisabled || !seekMax}
          aria-label="Seek"
        />
        <div className="audio-player__time">
          {formatTime(state.currentTime)} / {formatTime(state.duration)}
        </div>
      </div>
    </div>
  );
};
