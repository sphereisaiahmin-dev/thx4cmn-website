'use client';

import { useCallback, useMemo, useState } from 'react';

type SerialConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
type SerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>;
  readable?: ReadableStream<Uint8Array> | null;
  writable?: WritableStream<Uint8Array> | null;
};
type SerialLike = {
  requestPort: () => Promise<SerialPortLike>;
};

type DeviceChordType = 'maj' | 'min' | 'maj7' | 'min7' | 'maj9' | 'min9';
type DeviceStateSnapshot = {
  baseColor: [number, number, number];
  chords: Record<number, DeviceChordType>;
};

const DEFAULT_BASE_COLOR: [number, number, number] = [150, 150, 150];
const DEFAULT_CHORDS: Record<number, DeviceChordType> = {
  12: 'min7',
  13: 'maj7',
  14: 'min',
  15: 'maj',
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
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [baseColor, setBaseColor] = useState<[number, number, number]>(DEFAULT_BASE_COLOR);
  const [modifierChords, setModifierChords] =
    useState<Record<number, DeviceChordType>>(DEFAULT_CHORDS);
  const [deviceSnapshot, setDeviceSnapshot] = useState<DeviceStateSnapshot | null>(null);
  const [pendingStateRequest, setPendingStateRequest] = useState(false);

  const appendLog = (message: string) => {
    setLog((prev) => [message, ...prev].slice(0, 20));
  };

  const gridKeys = useMemo(
    () =>
      Array.from({ length: 4 }, (_, row) =>
        Array.from({ length: 4 }, (_, col) => col * 4 + row),
      ).flat(),
    [],
  );

  const baseColorCss = useMemo(
    () => `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`,
    [baseColor],
  );

  const formatHex = (values: [number, number, number]) =>
    `#${values
      .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0'))
      .join('')}`;

  const [hexValue, setHexValue] = useState(() => formatHex(DEFAULT_BASE_COLOR));

  const updateBaseColor = useCallback(
    (values: [number, number, number]) => {
      setBaseColor(values);
      setHexValue(formatHex(values));
    },
    [setBaseColor],
  );

  const parseHex = (value: string) => {
    const normalized = value.replace('#', '');
    if (normalized.length !== 6) {
      return null;
    }
    const next = [
      parseInt(normalized.slice(0, 2), 16),
      parseInt(normalized.slice(2, 4), 16),
      parseInt(normalized.slice(4, 6), 16),
    ] as [number, number, number];
    if (next.some((entry) => Number.isNaN(entry))) {
      return null;
    }
    return next;
  };

  const handleSerialLine = useCallback(
    (line: string) => {
      if (!line) {
        return;
      }
      if (line === 'pong') {
        appendLog('Received pong response from device.');
        return;
      }
      if (line === 'ok') {
        appendLog('Device acknowledged update.');
        return;
      }
      try {
        const payload = JSON.parse(line) as {
          baseColor?: [number, number, number];
          chords?: Record<string, DeviceChordType>;
        };
        if (payload.baseColor) {
          updateBaseColor([
            payload.baseColor[0],
            payload.baseColor[1],
            payload.baseColor[2],
          ]);
        }
        if (payload.chords) {
          setModifierChords((prev) => {
            const next = { ...prev };
            Object.entries(payload.chords ?? {}).forEach(([key, value]) => {
              const index = Number(key);
              if (!Number.isNaN(index)) {
                next[index] = value;
              }
            });
            return next;
          });
        }
        if (pendingStateRequest) {
          setDeviceSnapshot({
            baseColor: payload.baseColor ?? baseColor,
            chords: payload.chords
              ? Object.entries(payload.chords).reduce<Record<number, DeviceChordType>>(
                  (acc, [key, value]) => {
                    const index = Number(key);
                    if (!Number.isNaN(index)) {
                      acc[index] = value;
                    }
                    return acc;
                  },
                  { ...modifierChords },
                )
              : modifierChords,
          });
          setPendingStateRequest(false);
          appendLog('Loaded device state snapshot.');
        } else {
          appendLog('Received device JSON payload.');
        }
      } catch (error) {
        appendLog('Received unrecognized device message.');
      }
    },
    [appendLog, baseColor, modifierChords, pendingStateRequest, updateBaseColor],
  );

  const startReader = useCallback(
    async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            appendLog('Device connection closed the readable stream.');
            break;
          }
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? '';
            lines.forEach((line) => handleSerialLine(line.trim()));
          }
        }
      } catch (error) {
        appendLog('Reader stopped unexpectedly.');
      }
    },
    [appendLog, handleSerialLine],
  );

  const sendLine = useCallback(
    async (message: string) => {
      if (!writer) {
        appendLog('No writer available. Connect to a device first.');
        return;
      }
      try {
        const textEncoder = new TextEncoder();
        await writer.write(textEncoder.encode(`${message}\n`));
      } catch (error) {
        appendLog('Failed to send data to device.');
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
      appendLog('Requesting access to Web Serial device...');
      const port = await serial.requestPort();
      appendLog('Opening serial port at 115200 baud...');
      await port.open({ baudRate: 115200 });
      setPort(port);
      appendLog('Connected to device.');
      setStatus('connected');

      const portWriter = port.writable?.getWriter() ?? null;
      setWriter(portWriter);

      if (port.readable) {
        const reader = port.readable.getReader();
        startReader(reader);
        appendLog('Serial reader initialized.');
      } else {
        appendLog('Serial reader unavailable (no readable stream).');
      }

      appendLog('Sending ping payload...');
      await sendLine('ping');

      appendLog('Requesting current device state...');
      setPendingStateRequest(true);
      await sendLine('state');
    } catch (error) {
      console.error(error);
      setStatus('error');
      appendLog('Unable to connect to device.');
    }
  };

  const handleSendConfig = async () => {
    if (status !== 'connected') {
      appendLog('Connect to a device before sending updates.');
      return;
    }
    const snapshot = deviceSnapshot;
    const payloads: Array<Record<string, unknown>> = [];
    if (!snapshot || snapshot.baseColor.some((value, index) => value !== baseColor[index])) {
      payloads.push({ baseColor });
    }

    const chordDiff: Record<string, DeviceChordType> = {};
    Object.entries(modifierChords).forEach(([key, value]) => {
      const index = Number(key);
      if (!snapshot || snapshot.chords[index] !== value) {
        chordDiff[key] = value;
      }
    });
    if (Object.keys(chordDiff).length > 0) {
      payloads.push({ chords: chordDiff });
    }

    if (payloads.length === 0) {
      appendLog('No device changes to send.');
      return;
    }

    appendLog(`Sending ${payloads.length} payload${payloads.length > 1 ? 's' : ''}...`);
    for (const payload of payloads) {
      await sendLine(JSON.stringify(payload));
    }
    if (snapshot) {
      setDeviceSnapshot({
        baseColor,
        chords: { ...modifierChords },
      });
    }
  };

  const isModifierKey = (keyIndex: number) => keyIndex >= 12;
  const selectedIsModifier = selectedKey !== null ? isModifierKey(selectedKey) : false;

  return (
    <section className="space-y-6">
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-black/60">Key map</p>
          <div className="grid grid-cols-4 gap-3">
            {gridKeys.map((keyIndex) => {
              const isModifier = isModifierKey(keyIndex);
              const isSelected = selectedKey === keyIndex;
              const chordLabel = isModifier ? modifierChords[keyIndex] : null;
              const animationDelay = `${(keyIndex - 12) * 0.2}s`;
              return (
                <button
                  key={keyIndex}
                  type="button"
                  onClick={() => setSelectedKey(keyIndex)}
                  className={`relative flex aspect-square items-center justify-center rounded-xl border text-xs uppercase tracking-[0.2em] transition focus:outline-none ${
                    isSelected ? 'border-black ring-2 ring-black/30' : 'border-black/20'
                  } ${isModifier ? 'text-black/80' : 'text-black/60'}`}
                  style={
                    isModifier
                      ? { animationDelay }
                      : { backgroundColor: baseColorCss }
                  }
                  data-modifier={isModifier || undefined}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px]">Key {keyIndex}</span>
                    {isModifier && chordLabel && (
                      <span className="text-[9px] font-semibold">{chordLabel}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-black/60">
            <span className="inline-flex h-3 w-3 rounded-sm" style={{ backgroundColor: baseColorCss }} />
            Note key base color
          </div>
        </div>

        <aside className="rounded-2xl border border-black/10 bg-white p-5">
          <h2 className="text-xs uppercase tracking-[0.3em] text-black/60">Editor</h2>
          {selectedKey === null && (
            <p className="mt-4 text-sm text-black/60">
              Select a key from the grid to edit its configuration.
            </p>
          )}
          {selectedKey !== null && selectedIsModifier && (
            <div className="mt-4 space-y-4 text-sm text-black/70">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-black/50">
                  Modifier key {selectedKey}
                </p>
                <label className="mt-3 block text-xs uppercase tracking-[0.3em] text-black/60">
                  Chord type
                </label>
                <select
                  className="mt-2 w-full rounded-lg border border-black/20 bg-white px-3 py-2 text-sm"
                  value={modifierChords[selectedKey]}
                  onChange={(event) =>
                    setModifierChords((prev) => ({
                      ...prev,
                      [selectedKey]: event.target.value as DeviceChordType,
                    }))
                  }
                >
                  {['maj', 'min', 'maj7', 'min7', 'maj9', 'min9'].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-black/50">
                Modifier LEDs oscillate just like the device hardware.
              </p>
            </div>
          )}
          {selectedKey !== null && !selectedIsModifier && (
            <div className="mt-4 space-y-4 text-sm text-black/70">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-black/50">Note key color</p>
                <div className="mt-3 grid gap-3">
                  <label className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.3em] text-black/60">
                    R
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={baseColor[0]}
                      onChange={(event) =>
                        updateBaseColor([
                          Number(event.target.value),
                          baseColor[1],
                          baseColor[2],
                        ])
                      }
                      className="w-20 rounded border border-black/20 px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.3em] text-black/60">
                    G
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={baseColor[1]}
                      onChange={(event) =>
                        updateBaseColor([
                          baseColor[0],
                          Number(event.target.value),
                          baseColor[2],
                        ])
                      }
                      className="w-20 rounded border border-black/20 px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.3em] text-black/60">
                    B
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={baseColor[2]}
                      onChange={(event) =>
                        updateBaseColor([
                          baseColor[0],
                          baseColor[1],
                          Number(event.target.value),
                        ])
                      }
                      className="w-20 rounded border border-black/20 px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="text-xs uppercase tracking-[0.3em] text-black/60">
                    Hex
                    <input
                      type="text"
                      value={hexValue}
                      onChange={(event) => {
                        const value = event.target.value;
                        setHexValue(value);
                        const parsed = parseHex(value);
                        if (parsed) {
                          updateBaseColor(parsed);
                        }
                      }}
                      className="mt-2 w-full rounded border border-black/20 px-2 py-1 text-sm uppercase"
                      maxLength={7}
                    />
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-black/50">
                <span className="inline-flex h-3 w-3 rounded-sm" style={{ backgroundColor: baseColorCss }} />
                Applied to all note keys (0-11).
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleSendConfig}
            className="mt-6 w-full rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10"
          >
            Send to device
          </button>
        </aside>
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

      <style jsx>{`
        button[data-modifier='true'] {
          background: linear-gradient(135deg, rgba(255, 120, 120, 0.7), rgba(120, 120, 255, 0.7));
          animation: modifier-pulse 2.6s ease-in-out infinite;
        }

        @keyframes modifier-pulse {
          0% {
            filter: hue-rotate(0deg) brightness(1);
          }
          50% {
            filter: hue-rotate(120deg) brightness(1.15);
          }
          100% {
            filter: hue-rotate(240deg) brightness(1);
          }
        }
      `}</style>
    </section>
  );
}
