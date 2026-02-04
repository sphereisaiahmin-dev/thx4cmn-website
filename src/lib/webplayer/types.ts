export type Track = {
  key: string;
  title: string;
};

export type PlayerStatus = 'idle' | 'loading-list' | 'loading-track' | 'ready' | 'error';
