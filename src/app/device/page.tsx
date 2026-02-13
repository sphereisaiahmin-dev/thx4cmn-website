'use client';

import { HexColorPicker } from 'react-colorful';
import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CHORD_TYPES,
  DEFAULT_DEVICE_STATE,
  MODIFIER_KEY_IDS,
  NOTE_PRESET_MODES,
  NOTE_PRESET_SPEED_MAX,
  NOTE_PRESET_SPEED_MIN,
  DeviceConnectionState,
  DeviceSerialClient,
  DeviceState,
  ModifierKeyId,
  NotePresetMode,
} from '@/lib/deviceSerialClient';

type SessionLogEntry = {
  message: string;
  timestamp: number;
};

const MAX_LOG_ENTRIES = 80;
const KEEPALIVE_INTERVAL_MS = 4500;
const KEEPALIVE_FAILURE_THRESHOLD = 2;

// Keep UI key positions aligned with firmware PIM551 _ROTATED mapping.
const PIM551_ROTATED_MAP: Record<number, number> = {
  0: 12,
  1: 8,
  2: 4,
  3: 0,
  4: 13,
  5: 9,
  6: 5,
  7: 1,
  8: 14,
  9: 10,
  10: 6,
  11: 2,
  12: 15,
  13: 11,
  14: 7,
  15: 3,
};

const buildKeypadLayout = () => {
  const physicalToLogical = new Array<number>(16).fill(0);
  for (const [logicalKeyText, physicalKey] of Object.entries(PIM551_ROTATED_MAP)) {
    physicalToLogical[physicalKey] = Number(logicalKeyText);
  }

  return [
    physicalToLogical.slice(0, 4),
    physicalToLogical.slice(4, 8),
    physicalToLogical.slice(8, 12),
    physicalToLogical.slice(12, 16),
  ];
};

const KEYPAD_LAYOUT: number[][] = buildKeypadLayout();

const BLACK_NOTE_KEY_INDICES = new Set([1, 3, 6, 8, 10]);
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const COLOR_PICKER_WIDTH_PX = 200;
const PRESET_MODE_LABELS: Record<NotePresetMode, string> = {
  piano: 'Piano',
  gradient: 'Rain',
  rain: 'Gradient',
};

const formatLogTimestamp = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const normalizeHexColor = (value: string, fallback: string) => {
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return fallback;
  }

  return trimmed.toLowerCase();
};

const clampPresetSpeed = (value: number) =>
  Math.max(NOTE_PRESET_SPEED_MIN, Math.min(NOTE_PRESET_SPEED_MAX, value));
const normalizePresetSpeedProgress = (speed: number) =>
  (clampPresetSpeed(speed) - NOTE_PRESET_SPEED_MIN) /
  (NOTE_PRESET_SPEED_MAX - NOTE_PRESET_SPEED_MIN);

const cloneState = (state: DeviceState): DeviceState => ({
  notePreset: {
    mode: state.notePreset.mode,
    piano: {
      whiteKeyColor: state.notePreset.piano.whiteKeyColor,
      blackKeyColor: state.notePreset.piano.blackKeyColor,
    },
    gradient: {
      colorA: state.notePreset.gradient.colorA,
      colorB: state.notePreset.gradient.colorB,
      speed: state.notePreset.gradient.speed,
    },
    rain: {
      colorA: state.notePreset.rain.colorA,
      colorB: state.notePreset.rain.colorB,
      speed: state.notePreset.rain.speed,
    },
  },
  modifierChords: {
    '12': state.modifierChords['12'],
    '13': state.modifierChords['13'],
    '14': state.modifierChords['14'],
    '15': state.modifierChords['15'],
  },
});

const statesEqual = (a: DeviceState, b: DeviceState) =>
  a.notePreset.mode === b.notePreset.mode &&
  a.notePreset.piano.whiteKeyColor === b.notePreset.piano.whiteKeyColor &&
  a.notePreset.piano.blackKeyColor === b.notePreset.piano.blackKeyColor &&
  a.notePreset.gradient.colorA === b.notePreset.gradient.colorA &&
  a.notePreset.gradient.colorB === b.notePreset.gradient.colorB &&
  a.notePreset.gradient.speed === b.notePreset.gradient.speed &&
  a.notePreset.rain.colorA === b.notePreset.rain.colorA &&
  a.notePreset.rain.colorB === b.notePreset.rain.colorB &&
  a.notePreset.rain.speed === b.notePreset.rain.speed &&
  MODIFIER_KEY_IDS.every((keyId) => a.modifierChords[keyId] === b.modifierChords[keyId]);

const parseHexColor = (hex: string) => ({
  r: Number.parseInt(hex.slice(1, 3), 16),
  g: Number.parseInt(hex.slice(3, 5), 16),
  b: Number.parseInt(hex.slice(5, 7), 16),
});

const lerpChannel = (start: number, end: number, amount: number) =>
  Math.round(start + (end - start) * amount);

const lerpHex = (aHex: string, bHex: string, amount: number) => {
  const a = parseHexColor(aHex);
  const b = parseHexColor(bHex);
  const clamped = Math.max(0, Math.min(1, amount));

  const r = lerpChannel(a.r, b.r, clamped);
  const g = lerpChannel(a.g, b.g, clamped);
  const bChannel = lerpChannel(a.b, b.b, clamped);

  return `rgb(${r}, ${g}, ${bChannel})`;
};

const isColorDark = (hex: string) => {
  const { r, g, b } = parseHexColor(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
};

const getNotePreviewColor = (state: DeviceState, keyIndex: number, previewTick: number) => {
  const mode = state.notePreset.mode;
  if (mode === 'piano') {
    if (BLACK_NOTE_KEY_INDICES.has(keyIndex)) {
      return state.notePreset.piano.blackKeyColor;
    }
    return state.notePreset.piano.whiteKeyColor;
  }

  if (mode === 'gradient') {
    const span = 11;
    const base = keyIndex / span;
    const offset = (previewTick * state.notePreset.gradient.speed * 0.25) % 1;
    const blend = (base + offset) % 1;
    return lerpHex(state.notePreset.gradient.colorA, state.notePreset.gradient.colorB, blend);
  }

  const phase = previewTick * state.notePreset.rain.speed + keyIndex * 0.9;
  const blend = 0.5 + 0.5 * Math.sin(phase * 0.7 + Math.sin(phase * 0.21));
  return lerpHex(state.notePreset.rain.colorA, state.notePreset.rain.colorB, blend);
};

type ColorPaletteFieldProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
};

function ColorPaletteField({ label, value, onChange }: ColorPaletteFieldProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const textColorClass = isColorDark(value) ? 'text-white' : 'text-black';

  return (
    <div
      className="space-y-2 rounded-xl border border-black/15 bg-white/70 p-3"
      style={{ width: `${COLOR_PICKER_WIDTH_PX}px` }}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-black/70">{label}</p>
        <span
          className={`inline-flex h-8 min-w-[96px] items-center justify-center rounded-md border border-black/20 px-2 text-xs uppercase tracking-[0.16em] ${textColorClass}`}
          style={{ backgroundColor: value }}
        >
          {value}
        </span>
      </button>

      {isExpanded && (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border border-black/20">
            <HexColorPicker
              color={value}
              onChange={(next) => onChange(normalizeHexColor(next, value))}
              style={{ width: `${COLOR_PICKER_WIDTH_PX}px` }}
            />
          </div>
          <input
            type="text"
            value={value}
            onChange={(event) => onChange(normalizeHexColor(event.target.value, value))}
            className="w-full rounded-md border border-black/25 bg-white px-2 py-1 text-sm uppercase tracking-[0.08em]"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}

type AnimatedPresetSection = 'gradient' | 'rain';

const getAnimatedPresetSection = (mode: NotePresetMode): AnimatedPresetSection | null => {
  if (mode === 'gradient' || mode === 'rain') {
    return mode;
  }

  return null;
};

const getPresetColorFieldLabel = (
  section: AnimatedPresetSection,
  field: 'colorA' | 'colorB',
) => `${PRESET_MODE_LABELS[section]} color ${field === 'colorA' ? 'A' : 'B'}`;

const getPresetSpeedLabel = (section: AnimatedPresetSection) => `${PRESET_MODE_LABELS[section]} speed`;

export default function DevicePage() {
  const [status, setStatus] = useState<DeviceConnectionState>('idle');
  const [log, setLog] = useState<SessionLogEntry[]>([]);
  const [deviceState, setDeviceState] = useState<DeviceState>(cloneState(DEFAULT_DEVICE_STATE));
  const [draftState, setDraftState] = useState<DeviceState>(cloneState(DEFAULT_DEVICE_STATE));
  const [selectedModifierKey, setSelectedModifierKey] = useState<ModifierKeyId | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [previewTick, setPreviewTick] = useState(0);

  const clientRef = useRef<DeviceSerialClient | null>(null);
  const statusRef = useRef<DeviceConnectionState>('idle');
  const keepaliveTimerRef = useRef<number | null>(null);
  const keepaliveFailuresRef = useRef(0);
  const hasLoggedConnectionLostRef = useRef(false);

  const appendLog = useCallback((message: string) => {
    setLog((prev) => [{ message, timestamp: Date.now() }, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, []);

  const logConnectionLost = useCallback(() => {
    if (hasLoggedConnectionLostRef.current) {
      return;
    }

    hasLoggedConnectionLostRef.current = true;
    appendLog('Connection lost. Reconnect your device.');
  }, [appendLog]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPreviewTick((prev) => prev + 0.08);
    }, 60);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const stopKeepalive = useCallback(() => {
    if (keepaliveTimerRef.current !== null) {
      window.clearInterval(keepaliveTimerRef.current);
      keepaliveTimerRef.current = null;
    }
    keepaliveFailuresRef.current = 0;
  }, []);

  const disconnectClient = useCallback(async () => {
    stopKeepalive();

    if (!clientRef.current) {
      return;
    }

    const client = clientRef.current;
    clientRef.current = null;
    await client.disconnect();
  }, [stopKeepalive]);

  const hydrateState = useCallback((incoming: DeviceState) => {
    const next = cloneState(incoming);
    setDeviceState(next);
    setDraftState(next);
  }, []);

  const startKeepalive = useCallback(() => {
    stopKeepalive();

    keepaliveTimerRef.current = window.setInterval(async () => {
      const client = clientRef.current;
      if (!client || statusRef.current !== 'ready') {
        return;
      }

      try {
        await client.ping();
        keepaliveFailuresRef.current = 0;
      } catch {
        keepaliveFailuresRef.current += 1;

        if (keepaliveFailuresRef.current >= KEEPALIVE_FAILURE_THRESHOLD) {
          stopKeepalive();
          setStatus('error');
          logConnectionLost();
          await disconnectClient();
        }
      }
    }, KEEPALIVE_INTERVAL_MS);
  }, [disconnectClient, logConnectionLost, stopKeepalive]);

  const handleConnect = useCallback(async () => {
    if (status === 'connecting' || status === 'handshaking') {
      return;
    }

    if (!DeviceSerialClient.isSupported()) {
      setStatus('error');
      appendLog('Web Serial is not supported in this browser.');
      return;
    }

    await disconnectClient();

    const client = new DeviceSerialClient({
      onDisconnect: () => {
        stopKeepalive();
        setStatus('error');
        logConnectionLost();
      },
    });

    clientRef.current = client;
    setStatus('connecting');
    hasLoggedConnectionLostRef.current = false;
    appendLog('Connecting to thx-c...');

    try {
      await client.connect();
      setStatus('handshaking');

      const helloResponse = await client.handshake();
      hydrateState(helloResponse.payload.state);

      const stateResponse = await client.getState();
      hydrateState(stateResponse);

      setStatus('ready');
      startKeepalive();
      appendLog('Connected to thx-c. Settings synced.');
    } catch (error) {
      console.error(error);
      setStatus('error');
      logConnectionLost();

      await disconnectClient();
    }
  }, [
    appendLog,
    disconnectClient,
    hydrateState,
    logConnectionLost,
    startKeepalive,
    status,
    stopKeepalive,
  ]);

  const handleDisconnect = useCallback(async () => {
    await disconnectClient();
    setStatus('idle');
    hasLoggedConnectionLostRef.current = false;
    appendLog('Disconnected from thx-c.');
  }, [appendLog, disconnectClient]);

  const handleApplyConfig = useCallback(async () => {
    if (!clientRef.current || status !== 'ready' || isApplying) {
      return;
    }

    setIsApplying(true);

    try {
      const response = await clientRef.current.applyConfig(draftState, {
        configId: `cfg-${Date.now()}`,
        idempotencyKey: `idem-${Date.now()}`,
      });

      hydrateState(response.state);

      appendLog('Configuration updated on thx-c.');
    } catch {
      appendLog("Couldn't update configuration. Try again.");
    } finally {
      setIsApplying(false);
    }
  }, [appendLog, draftState, hydrateState, isApplying, status]);

  const handlePresetModeChange = useCallback((mode: NotePresetMode) => {
    setDraftState((prev) => ({
      ...prev,
      notePreset: {
        ...prev.notePreset,
        mode,
      },
    }));
  }, []);

  const handlePianoColorChange = useCallback(
    (field: 'whiteKeyColor' | 'blackKeyColor', color: string) => {
      setDraftState((prev) => ({
        ...prev,
        notePreset: {
          ...prev.notePreset,
          piano: {
            ...prev.notePreset.piano,
            [field]: normalizeHexColor(color, prev.notePreset.piano[field]),
          },
        },
      }));
    },
    [],
  );

  const handleAnimatedColorChange = useCallback(
    (section: 'gradient' | 'rain', field: 'colorA' | 'colorB', color: string) => {
      setDraftState((prev) => ({
        ...prev,
        notePreset: {
          ...prev.notePreset,
          [section]: {
            ...prev.notePreset[section],
            [field]: normalizeHexColor(color, prev.notePreset[section][field]),
          },
        },
      }));
    },
    [],
  );

  const handlePresetSpeedChange = useCallback((section: 'gradient' | 'rain', rawValue: string) => {
    const parsed = Number.parseFloat(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }

    setDraftState((prev) => ({
      ...prev,
      notePreset: {
        ...prev.notePreset,
        [section]: {
          ...prev.notePreset[section],
          speed: clampPresetSpeed(parsed),
        },
      },
    }));
  }, []);

  const handleModifierChordChange = useCallback(
    (keyId: ModifierKeyId, chord: string) => {
      if (!CHORD_TYPES.includes(chord as (typeof CHORD_TYPES)[number])) {
        return;
      }

      setDraftState((prev) => ({
        ...prev,
        modifierChords: {
          ...prev.modifierChords,
          [keyId]: chord as DeviceState['modifierChords'][ModifierKeyId],
        },
      }));
    },
    [],
  );

  useEffect(() => {
    return () => {
      void disconnectClient();
    };
  }, [disconnectClient]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const isBusy = status === 'connecting' || status === 'handshaking';
  const statusLabel =
    status === 'connecting' || status === 'handshaking' ? 'connecting...' : status;
  const hasDirtyConfig = useMemo(
    () => !statesEqual(deviceState, draftState),
    [deviceState, draftState],
  );

  const selectedModifierChord = selectedModifierKey
    ? draftState.modifierChords[selectedModifierKey]
    : null;
  const animatedPresetSection = getAnimatedPresetSection(draftState.notePreset.mode);
  const animatedPresetSpeed = animatedPresetSection
    ? draftState.notePreset[animatedPresetSection].speed
    : null;
  const animatedPresetSpeedProgress =
    animatedPresetSpeed === null ? 0.5 : normalizePresetSpeedProgress(animatedPresetSpeed);

  return (
    <section className="relative space-y-8">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-black/60">Device</p>
        <h1 className="text-3xl uppercase tracking-[0.3em]">thx-c</h1>
        <p className="max-w-2xl text-sm text-black/70">
          change your colors, patterns, and chords here for your thx-c device.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleConnect}
          disabled={isBusy}
          className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'ready' ? 'Reconnect device' : 'Connect device'}
        </button>

        <button
          type="button"
          onClick={handleDisconnect}
          disabled={!clientRef.current || isBusy}
          className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Disconnect
        </button>

        <span className="text-xs uppercase tracking-[0.3em] text-black/60">
          Status: {statusLabel}
        </span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(280px,420px)_minmax(280px,1fr)]">
        <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
          <h2 className="mb-4 text-sm uppercase tracking-[0.3em]">Keypad</h2>

          <div className="grid grid-cols-4 gap-3">
            {KEYPAD_LAYOUT.flat().map((keyIndex) => {
              const isModifier = keyIndex >= 12;
              const keyId = `${keyIndex}` as ModifierKeyId;

              if (isModifier) {
                const delayMs = (keyIndex - 12) * 120;
                const style = {
                  '--modifier-delay': `${delayMs}ms`,
                } as CSSProperties;

                return (
                  <button
                    key={keyIndex}
                    type="button"
                    onClick={() => setSelectedModifierKey(keyId)}
                    style={style}
                    className={`device-modifier-cycle flex aspect-square flex-col items-center justify-center rounded-xl border text-xs uppercase tracking-[0.2em] transition ${
                      selectedModifierKey === keyId
                        ? 'border-black bg-black text-white shadow-[0_0_0_2px_rgba(0,0,0,0.9)] ring-2 ring-black'
                        : 'border-black/40 bg-black text-white'
                    }`}
                  >
                    <span className="text-[10px] opacity-70">K{keyIndex}</span>
                    <span className="mt-1 text-[11px]">{draftState.modifierChords[keyId]}</span>
                  </button>
                );
              }

              const previewColor = getNotePreviewColor(draftState, keyIndex, previewTick);
              const noteTextClass =
                previewColor.startsWith('#') && isColorDark(previewColor)
                  ? 'text-white'
                  : 'text-black';

              return (
                <div
                  key={keyIndex}
                  className={`flex aspect-square flex-col items-center justify-center rounded-xl border border-black/30 text-xs uppercase tracking-[0.2em] ${noteTextClass}`}
                  style={{ backgroundColor: previewColor }}
                >
                  <span className="text-[10px] opacity-70">K{keyIndex}</span>
                  <span className="mt-1 text-[11px]">N{keyIndex}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
          <h2 className="text-sm uppercase tracking-[0.3em]">Configuration</h2>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,1fr)_220px]">
            <div className="space-y-3">
              {draftState.notePreset.mode === 'piano' && (
                <>
                  <ColorPaletteField
                    label="Piano white key color"
                    value={draftState.notePreset.piano.whiteKeyColor}
                    onChange={(color) => handlePianoColorChange('whiteKeyColor', color)}
                  />
                  <ColorPaletteField
                    label="Piano black key color"
                    value={draftState.notePreset.piano.blackKeyColor}
                    onChange={(color) => handlePianoColorChange('blackKeyColor', color)}
                  />
                </>
              )}

              {draftState.notePreset.mode === 'gradient' && (
                <>
                  <ColorPaletteField
                    label={getPresetColorFieldLabel('gradient', 'colorA')}
                    value={draftState.notePreset.gradient.colorA}
                    onChange={(color) => handleAnimatedColorChange('gradient', 'colorA', color)}
                  />
                  <ColorPaletteField
                    label={getPresetColorFieldLabel('gradient', 'colorB')}
                    value={draftState.notePreset.gradient.colorB}
                    onChange={(color) => handleAnimatedColorChange('gradient', 'colorB', color)}
                  />
                </>
              )}

              {draftState.notePreset.mode === 'rain' && (
                <>
                  <ColorPaletteField
                    label={getPresetColorFieldLabel('rain', 'colorA')}
                    value={draftState.notePreset.rain.colorA}
                    onChange={(color) => handleAnimatedColorChange('rain', 'colorA', color)}
                  />
                  <ColorPaletteField
                    label={getPresetColorFieldLabel('rain', 'colorB')}
                    value={draftState.notePreset.rain.colorB}
                    onChange={(color) => handleAnimatedColorChange('rain', 'colorB', color)}
                  />
                </>
              )}

              {animatedPresetSection && animatedPresetSpeed !== null && (
                <div
                  className="space-y-2 rounded-xl border border-black/15 bg-white/70 p-3 text-xs uppercase tracking-[0.2em] text-black/70"
                  style={{ width: `${COLOR_PICKER_WIDTH_PX}px` }}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span>{getPresetSpeedLabel(animatedPresetSection)}</span>
                    <span className="text-[11px]">{animatedPresetSpeed.toFixed(1)}x</span>
                  </span>
                  <input
                    type="range"
                    min={NOTE_PRESET_SPEED_MIN}
                    max={NOTE_PRESET_SPEED_MAX}
                    step={0.1}
                    value={animatedPresetSpeed}
                    onChange={(event) => handlePresetSpeedChange(animatedPresetSection, event.target.value)}
                    className="audio-player__rpm-slider block w-full"
                    style={{ '--rpm-progress': animatedPresetSpeedProgress } as CSSProperties}
                  />
                </div>
              )}
            </div>

            <div className="space-y-3 lg:self-start">
              <div className="space-y-2 rounded-xl border border-black/15 bg-white/70 p-3">
                <label className="text-xs uppercase tracking-[0.2em] text-black/70">
                  Note key preset
                </label>
                <select
                  value={draftState.notePreset.mode}
                  onChange={(event) => handlePresetModeChange(event.target.value as NotePresetMode)}
                  className="w-full rounded-lg border border-black/25 bg-white/80 px-3 py-2 text-sm uppercase tracking-[0.08em] text-black"
                >
                  {NOTE_PRESET_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {PRESET_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 rounded-xl border border-black/15 bg-white/70 p-3">
                {selectedModifierKey ? (
                  <>
                    <label className="text-[11px] uppercase tracking-[0.2em] text-black/65">
                      Change chord
                    </label>
                    <select
                      value={selectedModifierChord ?? CHORD_TYPES[0]}
                      onChange={(event) => handleModifierChordChange(selectedModifierKey, event.target.value)}
                      className="w-full rounded-lg border border-black/25 bg-white px-3 py-2 text-sm uppercase tracking-[0.08em] text-black"
                    >
                      {CHORD_TYPES.map((chord) => (
                        <option key={chord} value={chord}>
                          {chord}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <p className="text-[11px] uppercase tracking-[0.2em] text-black/65">
                    Select a modifier key
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleApplyConfig}
              disabled={status !== 'ready' || !hasDirtyConfig || isApplying || isBusy}
              className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isApplying ? 'Applying…' : 'Apply'}
            </button>

            <button
              type="button"
              onClick={() => setDraftState(cloneState(deviceState))}
              disabled={!hasDirtyConfig || isApplying}
              className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Undo
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
        <h2 className="text-sm uppercase tracking-[0.3em]">Session log</h2>
        <div className="mt-4 space-y-2 text-xs text-black/70">
          {log.length === 0 && <p>No activity yet. Connect your thx-c to begin.</p>}
          {log.map((entry, index) => (
            <p key={`${entry.timestamp}-${index}`}>
              [{formatLogTimestamp(entry.timestamp)}] {entry.message}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
