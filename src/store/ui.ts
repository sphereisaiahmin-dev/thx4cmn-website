'use client';

import { create } from 'zustand';

interface UiState {
  isMiniCartOpen: boolean;
  setMiniCartOpen: (isOpen: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isMiniCartOpen: false,
  setMiniCartOpen: (isOpen) => set({ isMiniCartOpen: isOpen }),
}));
