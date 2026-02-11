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

const sceneSwatches: Record<NotePresetId, string> = {
  piano: 'linear-gradient(145deg, #ebebeb 0%, #ebebeb 100%)',
  aurora_scene: 'linear-gradient(135deg, #8b5cf6 0%, #22d3ee 45%, #86efac 100%)',
  sunset_scene: 'linear-gradient(135deg, #fb7185 0%, #fb923c 50%, #fde68a 100%)',
  ocean_scene: 'linear-gradient(135deg, #0ea5e9 0%, #22d3ee 45%, #6366f1 100%)',
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
    setSendMessage('Sending configuration...');

    try {
      const payload = buildApplyConfigPayload();
      const ack: AckMessage = await clientRef.current.sendApplyConfig(payload);

      setSendState('success');
      setSendMessage(`Configuration applied (version ${ack.payload.appliedConfigVersion}).`);
      setLastAppliedVersion(ack.payload.appliedConfigVersion);
      setConfigVersion((prev) => Math.max(prev + 1, ack.payload.appliedConfigVersion + 1));
      appendInfo(`apply_config acknowledged at version ${ack.payload.appliedConfigVersion}.`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Unable to send configuration.';
      setSendState('error');
      setSendMessage(message);
      appendError(`apply_config failed: ${message}`);
    }
  }, [appendError, appendInfo, buildApplyConfigPayload, status]);

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
    <section className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-black/60">Device</p>
        <h1 className="text-3xl uppercase tracking-[0.3em]">thx-c Configurator Console</h1>
        <p className="max-w-3xl text-sm text-black/70">
          Connect the device, edit modifier chord types and note-key color presets, then push the
          configuration over NDJSON protocol v1.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
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
          onClick={handleSendConfig}
          disabled={status !== 'ready' || isSending}
          className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSending ? 'Sending...' : 'Send to device'}
        </button>

        <span className="text-xs uppercase tracking-[0.3em] text-black/60">Status: {status}</span>
        <span className="text-xs uppercase tracking-[0.3em] text-black/60">
          Config version: {configVersion}
        </span>
      </div>

      {helloAck && (
        <div className="rounded-2xl border border-black/10 bg-black/5 p-6 text-xs text-black/70">
          <h2 className="text-sm uppercase tracking-[0.3em]">Handshake</h2>
          <p className="mt-3">Device: {helloAck.device}</p>
          <p>Firmware: {helloAck.firmwareVersion}</p>
          <p>Protocol: v{helloAck.protocolVersion}</p>
          <p>Features: {helloAck.features.join(', ')}</p>
          {lastAppliedVersion !== null && <p>Last applied config: v{lastAppliedVersion}</p>}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
          <h2 className="text-sm uppercase tracking-[0.3em]">4x4 Key Grid</h2>
          <p className="mt-2 text-xs text-black/60">
            Right column keys (12-15) are modifiers. Click a key to edit its assigned chord or
            color preset.
          </p>

          <div className="mt-5 grid gap-3">
            {KEY_GRID_ROWS.map((row, rowIndex) => (
              <div key={`row-${rowIndex}`} className="grid grid-cols-4 gap-3">
                {row.map((keyIndex) => {
                  const modifier = isModifierKey(keyIndex);
                  const selected = selectedKey === keyIndex;

                  let tileStyle: CSSProperties = {};
                  let subLabel = modifier
                    ? CHORD_LABELS[modifierChords[String(keyIndex) as keyof ModifierChordMap]]
                    : PRESET_LABELS[notePresets[String(keyIndex) as keyof NoteKeyPresetMap]];

                  if (modifier) {
                    tileStyle = {
                      background: 'linear-gradient(145deg, rgba(17,24,39,0.92), rgba(55,65,81,0.85))',
                      color: '#f9fafb',
                    };
                  } else {
                    const preset = notePresets[String(keyIndex) as keyof NoteKeyPresetMap];
                    if (preset === 'piano') {
                      tileStyle = {
                        backgroundColor: isPianoBlackKey(keyIndex) ? '#182a4e' : '#ebebeb',
                        color: isPianoBlackKey(keyIndex) ? '#f8fafc' : '#111827',
                      };
                    } else {
                      tileStyle = {
                        background: sceneSwatches[preset],
                        color: '#f8fafc',
                      };
                    }
                  }

                  return (
                    <button
                      key={keyIndex}
                      type="button"
                      onClick={() => setSelectedKey(keyIndex)}
                      className={`min-h-[84px] rounded-xl border px-3 py-2 text-left transition ${
                        selected
                          ? 'border-black shadow-[0_0_0_2px_rgba(17,24,39,0.2)]'
                          : 'border-black/20 hover:border-black/40'
                      }`}
                      style={tileStyle}
                    >
                      <p className="text-[10px] uppercase tracking-[0.2em]">
                        {modifier ? 'Modifier' : 'Note'} {keyIndex}
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.2em]">{subLabel}</p>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
          <h2 className="text-sm uppercase tracking-[0.3em]">Key Inspector</h2>
          <p className="mt-2 text-xs text-black/60">Selected: {selectedLabel}</p>

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
                  setSendState('idle');
                  setSendMessage('');
                }}
                className="w-full rounded-lg border border-black/20 bg-white px-3 py-2 text-sm"
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
                Note color preset
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
                  setSendState('idle');
                  setSendMessage('');
                }}
                className="w-full rounded-lg border border-black/20 bg-white px-3 py-2 text-sm"
              >
                {NOTE_PRESET_OPTIONS.map((preset) => (
                  <option key={preset} value={preset}>
                    {PRESET_LABELS[preset]}
                  </option>
                ))}
              </select>
              <div
                className="h-16 rounded-lg border border-black/20"
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

          <div className="mt-6 rounded-lg border border-black/10 bg-white/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/60">Send status</p>
            <p
              className={`mt-2 text-xs ${
                sendState === 'error'
                  ? 'text-red-700'
                  : sendState === 'success'
                    ? 'text-emerald-700'
                    : 'text-black/70'
              }`}
            >
              {sendMessage || 'No send operation yet.'}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
        <h2 className="text-sm uppercase tracking-[0.3em]">Session log</h2>
        <div className="mt-4 space-y-2 text-xs text-black/70">
          {log.length === 0 && <p>No activity yet.</p>}
          {log.map((entry, index) => (
            <p key={`${entry.timestamp}-${index}`}>
              [{formatLogTimestamp(entry.timestamp)}] {entry.level.toUpperCase()} {entry.message}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
