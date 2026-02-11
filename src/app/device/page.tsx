'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  AckMessage,
  ApplyConfigPayload,
  DeviceConnectionState,
  DeviceSerialClient,
  HelloAckPayload,
  ProtocolEvent,
} from '@/lib/deviceSerialClient';
import {
  CHORD_LABELS,
  CHORD_OPTIONS,
  DEFAULT_MODIFIER_CHORDS,
  DEFAULT_NOTE_PRESETS,
  isModifierKey,
  isNoteKey,
  isPianoBlackKey,
  KEY_GRID_ROWS,
  MODIFIER_KEY_INDICES,
  NOTE_KEY_INDICES,
  NOTE_PRESET_OPTIONS,
  PRESET_LABELS,
  type ChordName,
  type ModifierChordMap,
  type NoteKeyPresetMap,
  type NotePresetId,
} from '@/lib/deviceConfig';

type SessionLogEntry = ProtocolEvent;
type SendState = 'idle' | 'sending' | 'success' | 'error';

const MAX_LOG_ENTRIES = 40;
const ALL_KEY_INDICES = [...NOTE_KEY_INDICES, ...MODIFIER_KEY_INDICES];

const sceneSwatches: Record<NotePresetId, string> = {
  piano: 'linear-gradient(145deg, #ebebeb 0%, #ebebeb 100%)',
  aurora_scene: 'linear-gradient(130deg, #7c3aed 0%, #22d3ee 45%, #86efac 100%)',
  sunset_scene: 'linear-gradient(130deg, #f43f5e 0%, #fb923c 48%, #fde68a 100%)',
  ocean_scene: 'linear-gradient(130deg, #0284c7 0%, #22d3ee 45%, #6366f1 100%)',
};

const formatLogTimestamp = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const nextIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `cfg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const cloneSet = (input: Set<number>) => new Set<number>(input);

export default function DevicePage() {
  const [status, setStatus] = useState<DeviceConnectionState>('idle');
  const [log, setLog] = useState<SessionLogEntry[]>([]);
  const [helloAck, setHelloAck] = useState<HelloAckPayload | null>(null);
  const [sendState, setSendState] = useState<SendState>('idle');
  const [sendMessage, setSendMessage] = useState<string>('');
  const [configVersion, setConfigVersion] = useState(1);
  const [lastAppliedVersion, setLastAppliedVersion] = useState<number | null>(null);
  const [selectedKey, setSelectedKey] = useState<number>(12);
  const [modifierChords, setModifierChords] = useState<ModifierChordMap>(DEFAULT_MODIFIER_CHORDS);
  const [notePresets, setNotePresets] = useState<NoteKeyPresetMap>(DEFAULT_NOTE_PRESETS);
  const [dirtyKeys, setDirtyKeys] = useState<Set<number>>(() => new Set(ALL_KEY_INDICES));
  const [sentKeys, setSentKeys] = useState<Set<number>>(() => new Set());
  const [errorKeys, setErrorKeys] = useState<Set<number>>(() => new Set());

  const clientRef = useRef<DeviceSerialClient | null>(null);

  const appendLog = useCallback((entry: SessionLogEntry) => {
    setLog((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, []);

  const appendInfo = useCallback(
    (message: string) => {
      appendLog({ level: 'info', message, timestamp: Date.now() });
    },
    [appendLog],
  );

  const appendError = useCallback(
    (message: string) => {
      appendLog({ level: 'error', message, timestamp: Date.now() });
    },
    [appendLog],
  );

  const markKeyDirty = useCallback((keyIndex: number) => {
    setDirtyKeys((prev) => {
      const next = cloneSet(prev);
      next.add(keyIndex);
      return next;
    });

    setSentKeys((prev) => {
      const next = cloneSet(prev);
      next.delete(keyIndex);
      return next;
    });

    setErrorKeys((prev) => {
      const next = cloneSet(prev);
      next.delete(keyIndex);
      return next;
    });

    setSendState('idle');
    setSendMessage('');
  }, []);

  const handleConnect = useCallback(async () => {
    if (status === 'connecting' || status === 'handshaking') {
      return;
    }

    if (!DeviceSerialClient.isSupported()) {
      setStatus('error');
      appendError('Web Serial is not supported in this browser.');
      return;
    }

    if (clientRef.current) {
      await clientRef.current.disconnect();
      clientRef.current = null;
    }

    const client = new DeviceSerialClient({
      onEvent: appendLog,
    });

    clientRef.current = client;
    setHelloAck(null);
    setStatus('connecting');
    setSendState('idle');
    setSendMessage('');

    try {
      await client.connect();
      setStatus('handshaking');

      const response = await client.handshake();
      setHelloAck(response.payload);
      setStatus('ready');
    } catch (error) {
      console.error(error);
      setStatus('error');
      appendError(error instanceof Error ? error.message : 'Unable to connect to device.');

      await client.disconnect();
      clientRef.current = null;
    }
  }, [appendError, appendLog, status]);

  const buildApplyConfigPayload = useCallback((): ApplyConfigPayload => {
    return {
      modifierChords,
      noteKeyColorPresets: notePresets,
      idempotencyKey: nextIdempotencyKey(),
      configVersion,
    };
  }, [configVersion, modifierChords, notePresets]);

  const handleSendConfig = useCallback(async () => {
    if (status !== 'ready' || !clientRef.current) {
      setSendState('error');
      setSendMessage('Connect and complete handshake before sending configuration.');
      appendError('Send blocked: device is not in ready state.');
      return;
    }

    setSendState('sending');
    setSendMessage('Pushing configuration to device...');

    const dirtySnapshot = cloneSet(dirtyKeys);

    try {
      const payload = buildApplyConfigPayload();
      const ack: AckMessage = await clientRef.current.sendApplyConfig(payload);

      setSendState('success');
      setSendMessage(`Device applied configuration v${ack.payload.appliedConfigVersion}.`);
      setLastAppliedVersion(ack.payload.appliedConfigVersion);
      setConfigVersion((prev) => Math.max(prev + 1, ack.payload.appliedConfigVersion + 1));

      setDirtyKeys(new Set());
      setErrorKeys(new Set());
      setSentKeys(dirtySnapshot.size > 0 ? dirtySnapshot : new Set(ALL_KEY_INDICES));

      appendInfo(`apply_config acknowledged at version ${ack.payload.appliedConfigVersion}.`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Unable to send configuration.';
      setSendState('error');
      setSendMessage(message);
      setErrorKeys(dirtySnapshot.size > 0 ? dirtySnapshot : new Set(ALL_KEY_INDICES));
      appendError(`apply_config failed: ${message}`);
    }
  }, [appendError, appendInfo, buildApplyConfigPayload, dirtyKeys, status]);

  useEffect(() => {
    return () => {
      if (!clientRef.current) {
        return;
      }

      void clientRef.current.disconnect();
      clientRef.current = null;
    };
  }, []);

  const isBusy = status === 'connecting' || status === 'handshaking';
  const isSending = sendState === 'sending';
  const selectedIsModifier = isModifierKey(selectedKey);

  const selectedLabel = useMemo(() => {
    if (selectedIsModifier) {
      return `Modifier key ${selectedKey}`;
    }

    return `Note key ${selectedKey}`;
  }, [selectedIsModifier, selectedKey]);

  const selectedPreset = isNoteKey(selectedKey)
    ? notePresets[String(selectedKey) as keyof NoteKeyPresetMap]
    : null;

  const selectedChord = selectedIsModifier
    ? modifierChords[String(selectedKey) as keyof ModifierChordMap]
    : null;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-cyan-200/20 bg-slate-950 p-6 text-slate-100 shadow-[0_30px_100px_rgba(8,47,73,0.6)] md:p-10">
      <div className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-4 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl" />

      <div className="relative space-y-8">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.4em] text-cyan-200/80">Device</p>
          <h1 className="text-3xl uppercase tracking-[0.28em] text-cyan-100">thx-c Neon Pad Studio</h1>
          <p className="max-w-3xl text-sm text-slate-300">
            Build live chord/color scenes for each key, then push them to your Pico over NDJSON v1.
            Modifier keys are the right column (12-15).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handleConnect}
            disabled={isBusy}
            className="rounded-full border border-cyan-300/40 bg-cyan-500/10 px-6 py-3 text-xs uppercase tracking-[0.3em] text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'ready' ? 'Reconnect device' : 'Connect device'}
          </button>

          <button
            type="button"
            onClick={handleSendConfig}
            disabled={status !== 'ready' || isSending}
            className="rounded-full border border-emerald-300/40 bg-emerald-500/10 px-6 py-3 text-xs uppercase tracking-[0.3em] text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? 'Sending...' : 'Send to device'}
          </button>

          <span className="text-xs uppercase tracking-[0.3em] text-slate-300">Status: {status}</span>
          <span className="text-xs uppercase tracking-[0.3em] text-slate-300">
            Config version: {configVersion}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-2xl border border-cyan-200/20 bg-slate-900/70 p-6 backdrop-blur">
            <h2 className="text-sm uppercase tracking-[0.3em] text-cyan-100">4x4 Key Grid</h2>
            <p className="mt-2 text-xs text-slate-300">
              States: cyan = selected, amber = dirty, green = sent, red = send error.
            </p>

            <div className="mt-5 grid gap-3">
              {KEY_GRID_ROWS.map((row, rowIndex) => (
                <div key={`row-${rowIndex}`} className="grid grid-cols-4 gap-3">
                  {row.map((keyIndex) => {
                    const modifier = isModifierKey(keyIndex);
                    const selected = selectedKey === keyIndex;
                    const dirty = dirtyKeys.has(keyIndex);
                    const sent = sentKeys.has(keyIndex);
                    const hasError = errorKeys.has(keyIndex);

                    const keyValueLabel = modifier
                      ? CHORD_LABELS[modifierChords[String(keyIndex) as keyof ModifierChordMap]]
                      : PRESET_LABELS[notePresets[String(keyIndex) as keyof NoteKeyPresetMap]];

                    let tileStyle: CSSProperties = {};
                    if (modifier) {
                      tileStyle = {
                        background:
                          'linear-gradient(145deg, rgba(76,29,149,0.72), rgba(12,74,110,0.72))',
                        color: '#f8fafc',
                        boxShadow: 'inset 0 0 24px rgba(34,211,238,0.22)',
                      };
                    } else {
                      const preset = notePresets[String(keyIndex) as keyof NoteKeyPresetMap];
                      if (preset === 'piano') {
                        tileStyle = {
                          backgroundColor: isPianoBlackKey(keyIndex) ? '#182a4e' : '#ebebeb',
                          color: isPianoBlackKey(keyIndex) ? '#f8fafc' : '#0f172a',
                        };
                      } else {
                        tileStyle = {
                          background: sceneSwatches[preset],
                          color: '#f8fafc',
                        };
                      }
                    }

                    const borderClass = hasError
                      ? 'border-red-400'
                      : dirty
                        ? 'border-amber-300'
                        : sent
                          ? 'border-emerald-300'
                          : selected
                            ? 'border-cyan-300'
                            : 'border-slate-500/50';

                    const glowClass = hasError
                      ? 'shadow-[0_0_22px_rgba(248,113,113,0.5)]'
                      : dirty
                        ? 'shadow-[0_0_22px_rgba(251,191,36,0.45)]'
                        : sent
                          ? 'shadow-[0_0_22px_rgba(74,222,128,0.45)]'
                          : selected
                            ? 'shadow-[0_0_26px_rgba(34,211,238,0.55)]'
                            : 'shadow-[0_0_10px_rgba(15,23,42,0.45)]';

                    return (
                      <button
                        key={keyIndex}
                        type="button"
                        onClick={() => setSelectedKey(keyIndex)}
                        className={`min-h-[92px] rounded-xl border px-3 py-2 text-left transition ${borderClass} ${glowClass}`}
                        style={tileStyle}
                      >
                        <p className="text-[10px] uppercase tracking-[0.2em] opacity-90">
                          {modifier ? 'Modifier' : 'Note'} {keyIndex}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.2em]">{keyValueLabel}</p>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-cyan-200/20 bg-slate-900/70 p-6 backdrop-blur">
              <h2 className="text-sm uppercase tracking-[0.3em] text-cyan-100">Inspector</h2>
              <p className="mt-2 text-xs text-slate-300">Selected: {selectedLabel}</p>

              {selectedIsModifier && selectedChord && (
                <div className="mt-5 space-y-2">
                  <label htmlFor="modifierChord" className="text-[11px] uppercase tracking-[0.2em]">
                    Chord type
                  </label>
                  <select
                    id="modifierChord"
                    value={selectedChord}
                    onChange={(event) => {
                      const nextChord = event.target.value as ChordName;
                      const selectedModifierKey = String(selectedKey) as keyof ModifierChordMap;
                      setModifierChords((prev) => ({
                        ...prev,
                        [selectedModifierKey]: nextChord,
                      }));
                      markKeyDirty(selectedKey);
                    }}
                    className="w-full rounded-lg border border-cyan-200/30 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    {CHORD_OPTIONS.map((chord) => (
                      <option key={chord} value={chord}>
                        {CHORD_LABELS[chord]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!selectedIsModifier && selectedPreset && (
                <div className="mt-5 space-y-2">
                  <label htmlFor="notePreset" className="text-[11px] uppercase tracking-[0.2em]">
                    Note color scene
                  </label>
                  <select
                    id="notePreset"
                    value={selectedPreset}
                    onChange={(event) => {
                      const nextPreset = event.target.value as NotePresetId;
                      const selectedNoteKey = String(selectedKey) as keyof NoteKeyPresetMap;
                      setNotePresets((prev) => ({
                        ...prev,
                        [selectedNoteKey]: nextPreset,
                      }));
                      markKeyDirty(selectedKey);
                    }}
                    className="w-full rounded-lg border border-cyan-200/30 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    {NOTE_PRESET_OPTIONS.map((preset) => (
                      <option key={preset} value={preset}>
                        {PRESET_LABELS[preset]}
                      </option>
                    ))}
                  </select>

                  <div
                    className="h-16 rounded-lg border border-cyan-200/20"
                    style={{
                      background:
                        selectedPreset === 'piano'
                          ? isPianoBlackKey(selectedKey)
                            ? '#182a4e'
                            : '#ebebeb'
                          : sceneSwatches[selectedPreset],
                    }}
                  />
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-cyan-200/20 bg-slate-900/70 p-6 text-xs text-slate-200 backdrop-blur">
              <h3 className="text-[11px] uppercase tracking-[0.25em] text-cyan-100">Send status</h3>
              <p
                className={`mt-3 ${
                  sendState === 'error'
                    ? 'text-red-300'
                    : sendState === 'success'
                      ? 'text-emerald-300'
                      : 'text-slate-300'
                }`}
              >
                {sendMessage || 'No send operation yet.'}
              </p>
              {lastAppliedVersion !== null && (
                <p className="mt-3 text-slate-400">Last applied version: v{lastAppliedVersion}</p>
              )}
            </div>

            {helloAck && (
              <div className="rounded-2xl border border-cyan-200/20 bg-slate-900/70 p-6 text-xs text-slate-300 backdrop-blur">
                <h3 className="text-[11px] uppercase tracking-[0.25em] text-cyan-100">Session</h3>
                <p className="mt-3">Device: {helloAck.device}</p>
                <p>Firmware: {helloAck.firmwareVersion}</p>
                <p>Protocol: v{helloAck.protocolVersion}</p>
                <p>Features: {helloAck.features.join(', ')}</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-200/20 bg-slate-900/70 p-6 backdrop-blur">
          <h2 className="text-sm uppercase tracking-[0.3em] text-cyan-100">Session Log</h2>
          <div className="mt-4 space-y-2 text-xs text-slate-300">
            {log.length === 0 && <p>No activity yet.</p>}
            {log.map((entry, index) => (
              <p key={`${entry.timestamp}-${index}`}>
                [{formatLogTimestamp(entry.timestamp)}] {entry.level.toUpperCase()} {entry.message}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
