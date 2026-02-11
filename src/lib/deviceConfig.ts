export const KEY_GRID_ROWS = [
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
] as const;

export const NOTE_KEY_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
export const MODIFIER_KEY_INDICES = [12, 13, 14, 15] as const;

export type NoteKeyIndex = (typeof NOTE_KEY_INDICES)[number];
export type ModifierKeyIndex = (typeof MODIFIER_KEY_INDICES)[number];

export const CHORD_OPTIONS = [
  'maj',
  'min',
  'maj7',
  'min7',
  'maj9',
  'min9',
  'maj79',
  'min79',
] as const;

export type ChordName = (typeof CHORD_OPTIONS)[number];

export const NOTE_PRESET_OPTIONS = ['piano', 'aurora_scene', 'sunset_scene', 'ocean_scene'] as const;

export type NotePresetId = (typeof NOTE_PRESET_OPTIONS)[number];

export type ModifierChordMap = Record<`${ModifierKeyIndex}`, ChordName>;
export type NoteKeyPresetMap = Record<`${NoteKeyIndex}`, NotePresetId>;

export const PIANO_BLACK_KEY_INDICES = [1, 3, 6, 8, 10] as const;

export const DEFAULT_MODIFIER_CHORDS: ModifierChordMap = {
  '12': 'min7',
  '13': 'maj7',
  '14': 'min',
  '15': 'maj',
};

export const DEFAULT_NOTE_PRESETS: NoteKeyPresetMap = {
  '0': 'piano',
  '1': 'piano',
  '2': 'piano',
  '3': 'piano',
  '4': 'piano',
  '5': 'piano',
  '6': 'piano',
  '7': 'piano',
  '8': 'piano',
  '9': 'piano',
  '10': 'piano',
  '11': 'piano',
};

export const PRESET_LABELS: Record<NotePresetId, string> = {
  piano: 'Piano',
  aurora_scene: 'Aurora Scene',
  sunset_scene: 'Sunset Scene',
  ocean_scene: 'Ocean Scene',
};

export const CHORD_LABELS: Record<ChordName, string> = {
  maj: 'Major',
  min: 'Minor',
  maj7: 'Major 7',
  min7: 'Minor 7',
  maj9: 'Major Add9',
  min9: 'Minor Add9',
  maj79: 'Major 7 Add9',
  min79: 'Minor 7 Add9',
};

const pianoBlackSet = new Set<number>(PIANO_BLACK_KEY_INDICES);

export const isPianoBlackKey = (keyIndex: number) => pianoBlackSet.has(keyIndex);

export const isModifierKey = (keyIndex: number): keyIndex is ModifierKeyIndex =>
  MODIFIER_KEY_INDICES.includes(keyIndex as ModifierKeyIndex);

export const isNoteKey = (keyIndex: number): keyIndex is NoteKeyIndex =>
  NOTE_KEY_INDICES.includes(keyIndex as NoteKeyIndex);
