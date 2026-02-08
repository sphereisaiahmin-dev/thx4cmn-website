'use client';

import { useEffect, useRef, useState } from 'react';

type SerialConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
type SerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>;
  writable?: WritableStream<Uint8Array> | null;
  readable?: ReadableStream<Uint8Array> | null;
};
type SerialLike = {
  requestPort: () => Promise<SerialPortLike>;
};

const CHORD_OPTIONS = ['maj', 'min', 'maj7', 'min7', 'maj9', 'min9'] as const;
const MODIFIER_KEYS = new Set([3, 7, 12, 15]);
const GRID_LAYOUT = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 12],
  [11, 13, 14, 15],
];

const clampColorValue = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const rgbToHex = (color: number[]) =>
  `#${color.map((value) => clampColorValue(value).toString(16).padStart(2, '0')).join('')}`;
const hexToRgb = (hexValue: string) => {
  const sanitized = hexValue.replace('#', '');
  if (sanitized.length !== 6) {
    return null;
  }
  const red = Number.parseInt(sanitized.slice(0, 2), 16);
  const green = Number.parseInt(sanitized.slice(2, 4), 16);
  const blue = Number.parseInt(sanitized.slice(4, 6), 16);
  if ([red, green, blue].some((value) => Number.isNaN(value))) {
    return null;
  }
  return [red, green, blue];
};

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
  const [writer, setWriter] = useState<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const [reader, setReader] = useState<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [baseColor, setBaseColor] = useState<[number, number, number]>([150, 150, 150]);
  const [modifierChords, setModifierChords] = useState<Record<number, string>>({
    3: 'maj',
    7: 'min',
    12: 'min7',
    15: 'maj7',
  });
  const readBufferRef = useRef('');
  const isConnected = status === 'connected' && Boolean(port);

  const appendLog = (message: string) => {
    setLog((prev) => [message, ...prev].slice(0, 20));
  };

  const sendRawMessage = async (
    message: string,
    writerOverride: WritableStreamDefaultWriter<Uint8Array> | null = writer,
  ) => {
    if (!writerOverride) {
      return;
    }
    const textEncoder = new TextEncoder();
    await writerOverride.write(textEncoder.encode(message));
  };

  const sendJsonPayload = async (payload: Record<string, unknown>) => {
    await sendRawMessage(`${JSON.stringify(payload)}\n`);
  };

  const startReader = async (readerInstance: ReadableStreamDefaultReader<Uint8Array>) => {
    const textDecoder = new TextDecoder();
    let buffer = readBufferRef.current;

    try {
      while (true) {
        const { value, done } = await readerInstance.read();
        if (done) {
          break;
        }
        if (!value) {
          continue;
        }
        buffer += textDecoder.decode(value, { stream: true });
        let newlineIndex = buffer.search(/[\r\n]/);
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            appendLog(`Device: ${line}`);
          }
          newlineIndex = buffer.search(/[\r\n]/);
        }
        readBufferRef.current = buffer;
      }
    } catch (error) {
      console.error(error);
      appendLog('Serial reader stopped unexpectedly.');
    }
  };

  const handleConnect = async () => {
    const serial = getSerial();
    if (!serial) {
      appendLog('Web Serial not supported in this browser.');
      setStatus('error');
      return;
    }

    try {
      setStatus('connecting');
      const connectedPort = await serial.requestPort();
      await connectedPort.open({ baudRate: 115200 });
      setPort(connectedPort);
      appendLog('Connected to device.');
      setStatus('connected');

      const nextWriter = connectedPort.writable?.getWriter() ?? null;
      setWriter(nextWriter);

      const nextReader = connectedPort.readable?.getReader() ?? null;
      setReader(nextReader);

      if (nextWriter) {
        await sendRawMessage('ping\n', nextWriter);
        appendLog('Sent ping payload.');
      }

      if (nextReader) {
        startReader(nextReader);
      }
    } catch (error) {
      console.error(error);
      setStatus('error');
      appendLog('Unable to connect to device.');
    }
  };

  const updateBaseColor = (nextColor: [number, number, number]) => {
    setBaseColor(nextColor);
    if (writer) {
      sendJsonPayload({ baseColor: nextColor }).then(() => {
        appendLog(`Sent base color update: ${nextColor.join(', ')}`);
      });
    }
  };

  const updateModifierChord = (keyIndex: number, chordName: string) => {
    setModifierChords((prev) => ({
      ...prev,
      [keyIndex]: chordName,
    }));
    if (writer) {
      sendJsonPayload({ chords: { [keyIndex]: chordName } }).then(() => {
        appendLog(`Sent chord update: ${keyIndex} → ${chordName}`);
      });
    }
  };

  useEffect(() => {
    return () => {
      reader?.cancel().catch(() => null);
      writer?.releaseLock();
      setReader(null);
      setWriter(null);
      setPort(null);
    };
  }, [reader, writer]);

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
          disabled={status === 'connecting' || isConnected}
          className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Connect device
        </button>
        <span className="text-xs uppercase tracking-[0.3em] text-black/60">Status: {status}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-black/10 bg-white/60 p-6">
          <h2 className="text-sm uppercase tracking-[0.3em] text-black/70">Key grid</h2>
          <p className="mt-2 text-xs text-black/60">
            Select a key to adjust its chord type or base LED color. Modifier keys live on the
            right edge of the grid.
          </p>
          <div className="mt-6 grid grid-cols-4 gap-3">
            {GRID_LAYOUT.flat().map((keyIndex) => {
              const isModifier = MODIFIER_KEYS.has(keyIndex);
              const isSelected = selectedKey === keyIndex;
              const chordLabel = modifierChords[keyIndex] ?? 'unset';
              return (
                <button
                  key={keyIndex}
                  type="button"
                  onClick={() => setSelectedKey(keyIndex)}
                  className={[
                    'flex aspect-square flex-col items-center justify-center rounded-xl border text-xs font-semibold uppercase tracking-[0.2em] transition',
                    isSelected ? 'border-black ring-2 ring-black/20' : 'border-black/10',
                    isModifier ? 'bg-black/10 text-black/70' : 'text-black/80',
                  ].join(' ')}
                  style={
                    isModifier
                      ? undefined
                      : {
                          backgroundColor: `rgb(${baseColor.join(',')})`,
                        }
                  }
                >
                  <span>Key {keyIndex}</span>
                  {isModifier && <span className="mt-1 text-[10px]">{chordLabel}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
          <h2 className="text-sm uppercase tracking-[0.3em] text-black/70">Editor</h2>
          {selectedKey === null ? (
            <p className="mt-4 text-xs text-black/60">Select a key to edit its settings.</p>
          ) : MODIFIER_KEYS.has(selectedKey) ? (
            <div className="mt-4 space-y-4 text-xs text-black/70">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-black/50">Modifier</p>
                <p className="mt-2 text-sm font-semibold">Key {selectedKey}</p>
              </div>
              <label className="block space-y-2">
                <span className="text-[10px] uppercase tracking-[0.3em] text-black/50">
                  Chord type
                </span>
                <select
                  className="w-full rounded-full border border-black/20 bg-white px-4 py-2 text-xs uppercase tracking-[0.3em]"
                  value={modifierChords[selectedKey] ?? 'maj'}
                  onChange={(event) => updateModifierChord(selectedKey, event.target.value)}
                >
                  {CHORD_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="mt-4 space-y-4 text-xs text-black/70">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-black/50">Note key</p>
                <p className="mt-2 text-sm font-semibold">Key {selectedKey}</p>
              </div>
              <label className="block space-y-2">
                <span className="text-[10px] uppercase tracking-[0.3em] text-black/50">
                  Base color
                </span>
                <input
                  type="color"
                  className="h-12 w-full cursor-pointer rounded-xl border border-black/20 bg-white p-1"
                  value={rgbToHex(baseColor)}
                  onChange={(event) => {
                    const rgb = hexToRgb(event.target.value);
                    if (rgb) {
                      updateBaseColor([rgb[0], rgb[1], rgb[2]]);
                    }
                  }}
                />
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['R', 'G', 'B'] as const).map((channel, index) => (
                  <label key={channel} className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-black/50">
                      {channel}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={255}
                      className="w-full rounded-full border border-black/20 px-3 py-2 text-xs"
                      value={baseColor[index]}
                      onChange={(event) => {
                        const nextValue = clampColorValue(Number(event.target.value || 0));
                        const nextColor: [number, number, number] = [...baseColor] as [
                          number,
                          number,
                          number,
                        ];
                        nextColor[index] = nextValue;
                        updateBaseColor(nextColor);
                      }}
                    />
                  </label>
                ))}
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
