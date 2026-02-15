'use client';

import { create } from 'zustand';

export type NowPlayingPlaybackState = 'playing' | 'paused' | 'idle';

interface UiState {
  isMiniCartOpen: boolean;
  nowPlayingTitle: string | null;
  nowPlayingPlaybackState: NowPlayingPlaybackState;
  setMiniCartOpen: (isOpen: boolean) => void;
  setNowPlaying: (title: string | null, playbackState: NowPlayingPlaybackState) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isMiniCartOpen: false,
  nowPlayingTitle: null,
  nowPlayingPlaybackState: 'idle',
  setMiniCartOpen: (isOpen) => set({ isMiniCartOpen: isOpen }),
  setNowPlaying: (title, playbackState) =>
    set({
      nowPlayingTitle: title,
      nowPlayingPlaybackState: playbackState,
    }),
}));
