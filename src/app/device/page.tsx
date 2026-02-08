'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type SerialConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
type SerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>;
  writable?: WritableStream<Uint8Array> | null;
  readable?: ReadableStream<Uint8Array> | null;
};
type SerialLike = {
  requestPort: () => Promise<SerialPortLike>;
};

const chordOptions = ['maj', 'min', 'maj7', 'min7', 'maj9', 'min9'] as const;
const modifierKeys = [12, 13, 14, 15];

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
  const [selectedKey, setSelectedKey] = useState<number>(0);
  const [baseColor, setBaseColor] = useState<[number, number, number]>([150, 150, 150]);
  const [chords, setChords] = useState<Record<number, (typeof chordOptions)[number]>>({
    12: 'min7',
    13: 'maj7',
    14: 'min',
    15: 'maj',
  });

  const textEncoder = useMemo(() => new TextEncoder(), []);

  const appendLog = useCallback((message: string) => {
    setLog((prev) => [message, ...prev].slice(0, 20));
  }, []);

  const sendPayload = useCallback(
    async (payload: Record<string, unknown>, message?: string) => {
      if (!writer) {
        return;
      }

      try {
        await writer.write(textEncoder.encode(`${JSON.stringify(payload)}\n`));
        if (message) {
          appendLog(message);
        }
      } catch (error) {
        console.error(error);
        appendLog('Failed to send payload.');
      }
    },
    [appendLog, textEncoder, writer],
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
      const portWriter = port.writable?.getWriter() ?? null;
      setPort(port);
      setWriter(portWriter);
      appendLog('Connected to device.');
      setStatus('connected');

      await portWriter?.write(textEncoder.encode('ping\n'));
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
    const textDecoder = new TextDecoder();
    let buffer = '';
    let cancelled = false;

    const readLoop = async () => {
      try {
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (!value) {
            continue;
          }

          buffer += textDecoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              continue;
            }
            appendLog(`Device: ${trimmed}`);
            if (/(pong|ok)/i.test(trimmed)) {
              appendLog(`Parsed response: ${trimmed}`);
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          appendLog('Serial read error.');
        }
      } finally {
        reader.releaseLock();
      }
    };

    void readLoop();

    return () => {
      cancelled = true;
      reader.cancel().catch(() => null);
    };
  }, [appendLog, port]);

  const selectedIsModifier = modifierKeys.includes(selectedKey);
  const baseColorHex = `#${baseColor
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;

  const handleChordChange = (key: number, value: (typeof chordOptions)[number]) => {
    setChords((prev) => ({ ...prev, [key]: value }));
    void sendPayload({ chords: { [String(key)]: value } }, `Sent chord update for key ${key}.`);
  };

  const clampChannel = (value: number) => Math.max(0, Math.min(255, value));

  const updateBaseColor = (nextColor: [number, number, number]) => {
    const clamped: [number, number, number] = [
      clampChannel(nextColor[0]),
      clampChannel(nextColor[1]),
      clampChannel(nextColor[2]),
    ];
    setBaseColor(clamped);
    void sendPayload({ baseColor: clamped }, 'Sent base color update.');
  };

  const handleHexChange = (value: string) => {
    const normalized = value.replace('#', '');
    if (normalized.length !== 6) {
      return;
    }
    const parsed = [
      parseInt(normalized.slice(0, 2), 16),
      parseInt(normalized.slice(2, 4), 16),
      parseInt(normalized.slice(4, 6), 16),
    ] as [number, number, number];
    if (parsed.some((channel) => Number.isNaN(channel))) {
      return;
    }
    updateBaseColor(parsed);
  };

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-black/60">Device</p>
        <h1 className="text-3xl uppercase tracking-[0.3em]">thx-c</h1>
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,_1fr)_320px]">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-black/60">Key grid</p>
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 16 }, (_, index) => {
              const isModifier = modifierKeys.includes(index);
              const isSelected = selectedKey === index;
              const chordLabel = chords[index] ?? 'maj';
              const baseStyles = 'flex aspect-square items-center justify-center rounded-2xl border text-xs';
              const selectionStyles = isSelected ? 'ring-2 ring-black' : 'hover:border-black/60';
              const modifierStyles = isModifier
                ? 'border-black/30 bg-white text-black'
                : 'border-black/20 text-black/80';
              const noteStyle = !isModifier
                ? {
                    backgroundColor: `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`,
                  }
                : undefined;

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelectedKey(index)}
                  className={`${baseStyles} ${modifierStyles} ${selectionStyles}`}
                  style={noteStyle}
                >
                  <span className="flex flex-col items-center gap-1 uppercase tracking-[0.2em]">
                    <span>{isModifier ? `M${index - 12}` : index}</span>
                    {isModifier && <span className="text-[10px]">{chordLabel}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-black/50">
            Keys 0–11 use the base color. Keys 12–15 are modifiers with chord assignments.
          </p>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-sm uppercase tracking-[0.3em] text-black/60">Editor</h2>
          <div className="mt-6 space-y-6">
            {selectedIsModifier ? (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-black/60">
                  Modifier {selectedKey}
                </p>
                <label className="block text-xs uppercase tracking-[0.2em] text-black/60">
                  Chord type
                </label>
                <select
                  value={chords[selectedKey] ?? 'maj'}
                  onChange={(event) =>
                    handleChordChange(
                      selectedKey,
                      event.target.value as (typeof chordOptions)[number],
                    )
                  }
                  className="w-full rounded-full border border-black/20 px-4 py-2 text-sm uppercase tracking-[0.2em]"
                >
                  {chordOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-black/60">
                  Note key {selectedKey}
                </p>
                <p className="text-xs text-black/50">
                  Updates the base LED color for keys 0–11.
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-xl border border-black/20"
                    style={{
                      backgroundColor: `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`,
                    }}
                  />
                  <input
                    type="color"
                    value={baseColorHex}
                    onChange={(event) => handleHexChange(event.target.value)}
                    className="h-12 w-12 cursor-pointer rounded-lg border border-black/20"
                  />
                  <input
                    type="text"
                    value={baseColorHex}
                    onChange={(event) => handleHexChange(event.target.value)}
                    className="flex-1 rounded-full border border-black/20 px-4 py-2 text-xs uppercase tracking-[0.2em]"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(['R', 'G', 'B'] as const).map((label, channelIndex) => (
                    <label key={label} className="space-y-2 text-xs uppercase tracking-[0.2em]">
                      <span className="text-black/60">{label}</span>
                      <input
                        type="number"
                        min={0}
                        max={255}
                        value={baseColor[channelIndex]}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value);
                          const nextColor = [...baseColor] as [number, number, number];
                          nextColor[channelIndex] = clampChannel(nextValue);
                          updateBaseColor(nextColor);
                        }}
                        className="w-full rounded-full border border-black/20 px-4 py-2 text-sm"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
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
