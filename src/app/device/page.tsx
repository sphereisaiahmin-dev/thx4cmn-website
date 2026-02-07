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
  const [chordMap, setChordMap] = useState<Record<number, string>>({
    12: 'min7',
    13: 'maj7',
    14: 'min',
    15: 'maj',
  });

  const appendLog = useCallback((message: string) => {
    setLog((prev) => [message, ...prev].slice(0, 20));
  }, []);

  const selectedKeyLabel = useMemo(() => {
    if (selectedKey === null) {
      return 'Select a key to edit.';
    }
    if (selectedKey >= 12) {
      return `Modifier key ${selectedKey}`;
    }
    return `Note key ${selectedKey}`;
  }, [selectedKey]);

  const sendPayload = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!writer) {
        appendLog('No active connection. Connect the device to send updates.');
        return;
      }
      try {
        const textEncoder = new TextEncoder();
        const message = `${JSON.stringify(payload)}\n`;
        await writer.write(textEncoder.encode(message));
        appendLog(`Sent payload: ${message.trim()}`);
      } catch (error) {
        console.error(error);
        appendLog('Failed to send payload.');
      }
    },
    [appendLog, writer],
  );

  useEffect(() => {
    if (!reader) {
      return;
    }
    let isCancelled = false;
    const textDecoder = new TextDecoder();

    const readLoop = async () => {
      try {
        while (!isCancelled) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            const decoded = textDecoder.decode(value, { stream: true }).trim();
            if (decoded.length > 0) {
              appendLog(`Received: ${decoded}`);
            }
          }
        }
      } catch (error) {
        console.error(error);
        appendLog('Serial read error.');
      }
    };

    readLoop();

    return () => {
      isCancelled = true;
      reader.releaseLock();
    };
  }, [appendLog, reader]);

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
      setPort(port);
      const nextWriter = port.writable?.getWriter() ?? null;
      setWriter(nextWriter);
      const nextReader = port.readable?.getReader() ?? null;
      setReader(nextReader);
      appendLog('Connected to device.');
      setStatus('connected');

      if (nextWriter) {
        const textEncoder = new TextEncoder();
        await nextWriter.write(textEncoder.encode('ping\n'));
        appendLog('Sent ping payload.');
      }
    } catch (error) {
      console.error(error);
      setStatus('error');
      appendLog('Unable to connect to device.');
    }
  };

  const handleSelectKey = (keyIndex: number) => {
    setSelectedKey(keyIndex);
  };

  const handleBaseColorChange = (channelIndex: number, value: number) => {
    const nextValue = Math.min(255, Math.max(0, value));
    setBaseColor((prev) => {
      const updated: [number, number, number] = [...prev] as [number, number, number];
      updated[channelIndex] = nextValue;
      void sendPayload({ baseColor: updated });
      return updated;
    });
  };

  const handleChordChange = (keyIndex: number, value: string) => {
    setChordMap((prev) => ({ ...prev, [keyIndex]: value }));
    void sendPayload({ chords: { [keyIndex]: value } });
  };

  const noteKeyStyle = useMemo(
    () => ({
      backgroundColor: `rgb(${baseColor.join(', ')})`,
    }),
    [baseColor],
  );

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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
          <h2 className="text-sm uppercase tracking-[0.3em]">Key grid</h2>
          <div className="mt-6 grid grid-cols-4 gap-4">
            {Array.from({ length: 16 }).map((_, index) => {
              const isModifier = index >= 12;
              const isSelected = selectedKey === index;
              const modifierValue = chordMap[index] ?? 'unset';

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSelectKey(index)}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border text-xs uppercase tracking-[0.2em] transition ${
                    isSelected ? 'border-black bg-white shadow-lg' : 'border-black/20 bg-white/60'
                  }`}
                >
                  <span className="text-[10px] text-black/60">Key {index}</span>
                  {isModifier ? (
                    <span className="mt-2 text-[10px] text-black/70">{modifierValue}</span>
                  ) : (
                    <span
                      className="mt-2 h-6 w-6 rounded-md border border-black/20"
                      style={noteKeyStyle}
                    />
                  )}
                  {isSelected && (
                    <span className="absolute inset-0 rounded-xl ring-2 ring-black/80" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-sm uppercase tracking-[0.3em]">Editor</h2>
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-black/60">
            {selectedKeyLabel}
          </p>
          {selectedKey === null && (
            <p className="mt-6 text-sm text-black/60">
              Choose a key to configure its chord mapping or base color.
            </p>
          )}
          {selectedKey !== null && selectedKey >= 12 && (
            <div className="mt-6 space-y-4">
              <label className="block text-xs uppercase tracking-[0.2em] text-black/60">
                Chord type
                <select
                  className="mt-2 w-full rounded-lg border border-black/20 bg-white px-3 py-2 text-sm uppercase tracking-[0.2em]"
                  value={chordMap[selectedKey] ?? 'maj'}
                  onChange={(event) => handleChordChange(selectedKey, event.target.value)}
                >
                  {['maj', 'min', 'maj7', 'min7', 'maj9', 'min9'].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {selectedKey !== null && selectedKey < 12 && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-xs uppercase tracking-[0.2em] text-black/60">
                  Base color
                </span>
                <span
                  className="h-8 w-8 rounded-lg border border-black/20"
                  style={noteKeyStyle}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['R', 'G', 'B'] as const).map((label, channelIndex) => (
                  <label
                    key={label}
                    className="flex flex-col text-[10px] uppercase tracking-[0.2em] text-black/60"
                  >
                    {label}
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={baseColor[channelIndex]}
                      onChange={(event) =>
                        handleBaseColorChange(channelIndex, Number(event.target.value))
                      }
                      className="mt-2 rounded-md border border-black/20 px-2 py-2 text-sm"
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
