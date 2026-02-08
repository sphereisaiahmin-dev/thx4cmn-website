'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SerialConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
type SerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>;
  writable?: WritableStream<Uint8Array> | null;
  readable?: ReadableStream<Uint8Array> | null;
};
type SerialLike = {
  requestPort: () => Promise<SerialPortLike>;
};

type ChordType = 'maj' | 'min' | 'maj7' | 'min7' | 'maj9' | 'min9';

const CHORD_OPTIONS: ChordType[] = ['maj', 'min', 'maj7', 'min7', 'maj9', 'min9'];
const DEFAULT_CHORDS: Record<number, ChordType> = {
  12: 'min7',
  13: 'maj7',
  14: 'min',
  15: 'maj',
};
const DEFAULT_BASE_COLOR: [number, number, number] = [150, 150, 150];
const MODIFIER_KEYS = [3, 7, 12, 15];

const getSerial = (): SerialLike | null => {
  if (!('serial' in navigator)) {
    return null;
  }

  return (navigator as Navigator & { serial: SerialLike }).serial;
};

export default function DevicePage() {
  const [status, setStatus] = useState<SerialConnectionState>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [port, setPort] = useState<SerialPortLike | null>(null);
  const [writer, setWriter] = useState<WritableStreamDefaultWriter<Uint8Array> | null>(
    null,
  );
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [baseColor, setBaseColor] = useState<[number, number, number]>(DEFAULT_BASE_COLOR);
  const [modifierChords, setModifierChords] = useState<Record<number, ChordType>>(() =>
    MODIFIER_KEYS.reduce(
      (accumulator, key) => ({
        ...accumulator,
        [key]: DEFAULT_CHORDS[key] ?? 'maj',
      }),
      {},
    ),
  );
  const textEncoderRef = useRef(new TextEncoder());
  const textDecoderRef = useRef(new TextDecoder());
  const readerBufferRef = useRef('');

  const appendLog = useCallback((message: string) => {
    setLog((prev) => [message, ...prev].slice(0, 20));
  }, []);

  const noteKeys = useMemo(
    () => Array.from({ length: 16 }, (_, index) => index).filter((key) => !MODIFIER_KEYS.includes(key)),
    [],
  );
  const gridRows = useMemo(() => {
    return Array.from({ length: 4 }, (_, rowIndex) => {
      const row: number[] = [];
      for (let columnIndex = 0; columnIndex < 4; columnIndex += 1) {
        if (columnIndex === 3) {
          row.push(MODIFIER_KEYS[rowIndex]);
        } else {
          row.push(noteKeys[rowIndex * 3 + columnIndex]);
        }
      }
      return row;
    });
  }, [noteKeys]);

  const isModifierKey = useCallback((key: number) => MODIFIER_KEYS.includes(key), []);

  const sendPayload = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!writer) {
        return;
      }
      try {
        const message = `${JSON.stringify(payload)}\n`;
        await writer.write(textEncoderRef.current.encode(message));
        appendLog(`Sent: ${message.trim()}`);
      } catch (error) {
        console.error(error);
        appendLog('Failed to send payload.');
      }
    },
    [appendLog, writer],
  );

  const handleConnect = async () => {
    const serial = getSerial();
    if (!serial) {
      appendLog('Web Serial not supported in this browser.');
      setStatus('error');
      return;
    }

    try {
      setStatus('connecting');
      const port = await serial.requestPort();
      await port.open({ baudRate: 115200 });
      const nextWriter = port.writable?.getWriter() ?? null;
      setPort(port);
      setWriter(nextWriter);
      appendLog('Connected to device.');
      setStatus('connected');

      await nextWriter?.write(textEncoderRef.current.encode('ping'));
      appendLog('Sent ping payload.');
    } catch (error) {
      console.error(error);
      setStatus('error');
      appendLog('Unable to connect to device.');
    }
  };

  useEffect(() => {
    if (!port?.readable) {
      return;
    }

    const reader = port.readable.getReader();
    let isActive = true;

    const readLoop = async () => {
      try {
        while (isActive) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (!value) {
            continue;
          }
          const chunk = textDecoderRef.current.decode(value, { stream: true });
          readerBufferRef.current += chunk;
          const lines = readerBufferRef.current.split(/[\r\n]+/);
          readerBufferRef.current = lines.pop() ?? '';
          lines.filter(Boolean).forEach((line) => appendLog(`Device: ${line}`));
        }
      } catch (error) {
        console.error(error);
        appendLog('Serial reader stopped unexpectedly.');
      }
    };

    void readLoop();

    return () => {
      isActive = false;
      reader.releaseLock();
    };
  }, [appendLog, port]);

  const handleChordChange = async (key: number, chord: ChordType) => {
    setModifierChords((prev) => ({
      ...prev,
      [key]: chord,
    }));
    await sendPayload({ chords: { [key]: chord } });
  };

  const handleBaseColorChange = async (nextColor: [number, number, number]) => {
    setBaseColor(nextColor);
    await sendPayload({ baseColor: nextColor });
  };

  const selectedIsModifier = selectedKey !== null && isModifierKey(selectedKey);
  const baseColorStyle = {
    backgroundColor: `rgb(${baseColor.join(',')})`,
  };

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-black/60">Device</p>
        <h1 className="text-3xl uppercase tracking-[0.3em]">Chord device beta</h1>
        <p className="max-w-2xl text-sm text-black/70">
          This beta tool will configure LED palettes and chord mappings for the handheld
          thx4cmn MIDI device. The full protocol will land in a future release.
        </p>
        <span className="inline-flex rounded-full border border-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.3em]">
          Beta
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={handleConnect}
          className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10"
        >
          Connect device
        </button>
        <span className="text-xs uppercase tracking-[0.3em] text-black/60">Status: {status}</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-black/60">Key grid</p>
          <div className="grid grid-cols-4 gap-3">
            {gridRows.flat().map((key) => {
              const isModifier = isModifierKey(key);
              const isSelected = selectedKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border text-[10px] uppercase tracking-[0.2em] transition ${
                    isSelected ? 'border-black ring-2 ring-black/40' : 'border-black/20'
                  } ${isModifier ? 'bg-black/10' : ''}`}
                  style={isModifier ? undefined : baseColorStyle}
                >
                  <span>Key {key}</span>
                  {isModifier && (
                    <span className="text-[9px] text-black/60">
                      {modifierChords[key] ?? '—'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-6 rounded-2xl border border-black/10 bg-black/5 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-black/60">Editor</p>
          {selectedKey === null && (
            <p className="text-sm text-black/70">Select a key to edit its settings.</p>
          )}
          {selectedKey !== null && selectedIsModifier && (
            <div className="space-y-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em]">Modifier key {selectedKey}</p>
                <p className="text-xs text-black/60">Assign the chord type for this modifier.</p>
              </div>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-black/60">
                Chord type
                <select
                  className="rounded-xl border border-black/20 bg-white px-4 py-2 text-sm text-black"
                  value={modifierChords[selectedKey] ?? 'maj'}
                  onChange={(event) =>
                    handleChordChange(selectedKey, event.target.value as ChordType)
                  }
                >
                  {CHORD_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {selectedKey !== null && !selectedIsModifier && (
            <div className="space-y-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em]">Note keys</p>
                <p className="text-xs text-black/60">
                  Adjust the base color applied to all note keys.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div
                  className="h-12 w-12 rounded-xl border border-black/20"
                  style={baseColorStyle}
                />
                <div className="grid grid-cols-3 gap-3">
                  {(['R', 'G', 'B'] as const).map((label, index) => (
                    <label
                      key={label}
                      className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.3em] text-black/60"
                    >
                      {label}
                      <input
                        type="number"
                        min={0}
                        max={255}
                        value={baseColor[index]}
                        onChange={(event) => {
                          const nextValue = Math.min(
                            255,
                            Math.max(0, Number(event.target.value) || 0),
                          );
                          const nextColor: [number, number, number] = [...baseColor] as [
                            number,
                            number,
                            number,
                          ];
                          nextColor[index] = nextValue;
                          void handleBaseColorChange(nextColor);
                        }}
                        className="w-20 rounded-lg border border-black/20 bg-white px-2 py-1 text-sm text-black"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
        <h2 className="text-sm uppercase tracking-[0.3em]">Session log</h2>
        <div className="mt-4 space-y-2 text-xs text-black/60">
          {log.length === 0 && <p>No activity yet.</p>}
          {log.map((entry, index) => (
            <p key={index}>{entry}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
