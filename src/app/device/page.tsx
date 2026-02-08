'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type SerialConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
type SerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>;
  writable?: WritableStream<Uint8Array> | null;
  readable?: ReadableStream<Uint8Array> | null;
};
type SerialLike = {
  requestPort: () => Promise<SerialPortLike>;
};

const NOTE_KEYS = Array.from({ length: 12 }, (_, index) => index);
const MODIFIER_KEYS = [12, 13, 14, 15];
const CHORD_OPTIONS = ['maj', 'min', 'maj7', 'min7', 'maj9', 'min9'] as const;
const OSCILLATE_MIN = 10;
const OSCILLATE_MAX = 140;
const OSCILLATE_SPEED = 2.2;

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
  const [baseColor, setBaseColor] = useState<[number, number, number]>([150, 150, 150]);
  const [deviceBaseColor, setDeviceBaseColor] = useState<[number, number, number]>([
    150,
    150,
    150,
  ]);
  const [modifierChordTypes, setModifierChordTypes] = useState<Record<number, string>>({
    12: 'min7',
    13: 'maj7',
    14: 'min',
    15: 'maj',
  });
  const [deviceChordTypes, setDeviceChordTypes] = useState<Record<number, string>>({
    12: 'min7',
    13: 'maj7',
    14: 'min',
    15: 'maj',
  });
  const [oscillationTime, setOscillationTime] = useState(0);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const readBufferRef = useRef('');
  const pingResolverRef = useRef<((value: boolean) => void) | null>(null);
  const pingTimeoutRef = useRef<number | null>(null);

  const appendLog = (message: string) => {
    setLog((prev) => [message, ...prev].slice(0, 20));
  };

  const sleep = (duration: number) =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, duration);
    });

  const isModifierKey = (keyIndex: number) => MODIFIER_KEYS.includes(keyIndex);

  const clampColorChannel = (value: number) => Math.max(0, Math.min(255, value));

  const baseColorHex = useMemo(() => {
    return `#${baseColor
      .map((value) => clampColorChannel(value).toString(16).padStart(2, '0'))
      .join('')}`;
  }, [baseColor]);

  const gridKeys = useMemo(() => Array.from({ length: 16 }, (_, index) => index), []);

  const oscillatingChannel = (timeValue: number, phase: number) => {
    const span = OSCILLATE_MAX - OSCILLATE_MIN;
    return Math.round(OSCILLATE_MIN + (span * (Math.sin(timeValue + phase) + 1)) / 2);
  };

  const modifierKeyColor = (keyIndex: number) => {
    const offset = MODIFIER_KEYS.indexOf(keyIndex);
    if (offset < 0) {
      return 'transparent';
    }
    const red = oscillatingChannel(oscillationTime * OSCILLATE_SPEED, 0.6 + offset);
    const green = oscillatingChannel(oscillationTime * OSCILLATE_SPEED, 2.7 + offset);
    const blue = oscillatingChannel(oscillationTime * OSCILLATE_SPEED, 4.8 + offset);
    return `rgb(${red}, ${green}, ${blue})`;
  };

  const handleSerialLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    if (trimmed === 'pong') {
      appendLog('Received pong response.');
      if (pingResolverRef.current) {
        pingResolverRef.current(true);
        pingResolverRef.current = null;
      }
      if (pingTimeoutRef.current) {
        window.clearTimeout(pingTimeoutRef.current);
        pingTimeoutRef.current = null;
      }
      return;
    }
    if (trimmed === 'ok') {
      appendLog('Device acknowledged update.');
      return;
    }
    try {
      const payload = JSON.parse(trimmed) as {
        baseColor?: [number, number, number];
        chords?: Record<string, string>;
      };
      if (payload.baseColor && payload.baseColor.length >= 3) {
        const normalized: [number, number, number] = [
          clampColorChannel(payload.baseColor[0]),
          clampColorChannel(payload.baseColor[1]),
          clampColorChannel(payload.baseColor[2]),
        ];
        setBaseColor(normalized);
        setDeviceBaseColor(normalized);
      }
      if (payload.chords) {
        setDeviceChordTypes((prev) => {
          const nextChords: Record<number, string> = { ...prev };
          Object.entries(payload.chords ?? {}).forEach(([key, value]) => {
            const index = Number(key);
            if (Number.isFinite(index) && isModifierKey(index)) {
              nextChords[index] = value;
            }
          });
          setModifierChordTypes(nextChords);
          return nextChords;
        });
      }
      appendLog('Updated local state from device response.');
    } catch (error) {
      appendLog(`Unhandled device response: ${trimmed}`);
    }
  };

  const startReader = async (activePort: SerialPortLike) => {
    if (!activePort.readable) {
      appendLog('Device stream is not readable.');
      return;
    }
    const reader = activePort.readable.getReader();
    readerRef.current = reader;
    const decoder = new TextDecoder();
    appendLog('Listening for device responses...');
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          appendLog('Device reader closed.');
          setStatus('error');
          setPort(null);
          setWriter(null);
          writerRef.current?.releaseLock();
          writerRef.current = null;
          if (pingResolverRef.current) {
            pingResolverRef.current(false);
            pingResolverRef.current = null;
          }
          break;
        }
        if (value) {
          readBufferRef.current += decoder.decode(value, { stream: true });
          let newlineIndex = readBufferRef.current.indexOf('\n');
          while (newlineIndex !== -1) {
            const line = readBufferRef.current.slice(0, newlineIndex);
            readBufferRef.current = readBufferRef.current.slice(newlineIndex + 1);
            handleSerialLine(line);
            newlineIndex = readBufferRef.current.indexOf('\n');
          }
        }
      }
    } catch (error) {
      appendLog('Reader error: unable to process device output.');
      console.error(error);
    } finally {
      reader.releaseLock();
      readerRef.current = null;
    }
  };

  const ensureWriter = () => {
    if (writerRef.current) {
      return writerRef.current;
    }
    if (port?.writable) {
      const nextWriter = port.writable.getWriter();
      setWriter(nextWriter);
      writerRef.current = nextWriter;
      return nextWriter;
    }
    return null;
  };

  const sendMessage = async (message: string) => {
    const activeWriter = ensureWriter() ?? writer;
    if (!activeWriter) {
      appendLog('No active serial writer. Connect the device first.');
      return false;
    }
    try {
      const encoder = new TextEncoder();
      await activeWriter.write(encoder.encode(message));
      return true;
    } catch (error) {
      appendLog('Failed to send data to device.');
      console.error(error);
      try {
        activeWriter.releaseLock();
      } catch (releaseError) {
        console.error(releaseError);
      }
      if (writerRef.current === activeWriter) {
        writerRef.current = null;
      }
      setWriter(null);
      return false;
    }
  };

  const waitForPong = (timeoutMs: number) =>
    new Promise<boolean>((resolve) => {
      if (pingResolverRef.current) {
        pingResolverRef.current(false);
      }
      pingResolverRef.current = resolve;
      if (pingTimeoutRef.current) {
        window.clearTimeout(pingTimeoutRef.current);
      }
      pingTimeoutRef.current = window.setTimeout(() => {
        if (pingResolverRef.current === resolve) {
          pingResolverRef.current = null;
          resolve(false);
        }
      }, timeoutMs);
    });

  const handleConnect = async () => {
    const serial = getSerial();
    if (!serial) {
      appendLog('Web Serial not supported in this browser.');
      setStatus('error');
      return;
    }

    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (writerRef.current) {
        writerRef.current.releaseLock();
        writerRef.current = null;
      }
      if (port) {
        await port.close();
        setPort(null);
      }
      setStatus('connecting');
      appendLog('Requesting device access...');
      const port = await serial.requestPort();
      appendLog('Opening serial connection...');
      await port.open({ baudRate: 115200 });
      const activeWriter = port.writable?.getWriter() ?? null;
      setPort(port);
      setWriter(activeWriter);
      writerRef.current = activeWriter;
      appendLog('Connected to device at 115200 baud.');
      setStatus('connected');

      void startReader(port);
      await sleep(1000);
      const pingSent = await sendMessage('ping\n');
      if (pingSent) {
        appendLog('Sent ping payload.');
        const pongReceived = await waitForPong(4000);
        if (!pongReceived) {
          appendLog('No pong response yet. Device may still be booting.');
        }
      }
      const stateSent = await sendMessage('state\n');
      if (stateSent) {
        appendLog('Requested current device state.');
      }
    } catch (error) {
      console.error(error);
      setStatus('error');
      appendLog('Unable to connect to device. Check the cable and permissions.');
    }
  };

  const handleBaseColorChange = (channelIndex: number, value: number) => {
    setBaseColor((prev) => {
      const next = [...prev] as [number, number, number];
      next[channelIndex] = clampColorChannel(value);
      return next;
    });
  };

  const handleHexChange = (value: string) => {
    const hexValue = value.replace('#', '');
    if (hexValue.length !== 6) {
      return;
    }
    const next = [
      parseInt(hexValue.slice(0, 2), 16),
      parseInt(hexValue.slice(2, 4), 16),
      parseInt(hexValue.slice(4, 6), 16),
    ] as [number, number, number];
    if (next.some((channel) => Number.isNaN(channel))) {
      return;
    }
    setBaseColor(next);
  };

  const handleSendToDevice = async () => {
    if (status !== 'connected') {
      appendLog('Cannot send updates while disconnected.');
      return;
    }

    const changedChords: Record<string, string> = {};
    Object.entries(modifierChordTypes).forEach(([key, value]) => {
      const index = Number(key);
      if (!Number.isFinite(index)) {
        return;
      }
      if (deviceChordTypes[index] !== value) {
        changedChords[String(index)] = value;
      }
    });

    const baseColorChanged = baseColor.some(
      (value, index) => value !== deviceBaseColor[index]
    );

    if (Object.keys(changedChords).length === 0 && !baseColorChanged) {
      appendLog('No changes to send.');
      return;
    }

    if (Object.keys(changedChords).length > 0) {
      const payload = JSON.stringify({ chords: changedChords });
      const sent = await sendMessage(`${payload}\n`);
      if (sent) {
        appendLog('Sent chord updates.');
        setDeviceChordTypes({ ...modifierChordTypes });
      }
    }

    if (baseColorChanged) {
      const payload = JSON.stringify({ baseColor });
      const sent = await sendMessage(`${payload}\n`);
      if (sent) {
        appendLog('Sent base color update.');
        setDeviceBaseColor([...baseColor] as [number, number, number]);
      }
    }
  };

  useEffect(() => {
    let animationFrame = 0;
    const updateTime = (time: number) => {
      setOscillationTime(time / 1000);
      animationFrame = window.requestAnimationFrame(updateTime);
    };
    animationFrame = window.requestAnimationFrame(updateTime);
    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    return () => {
      void readerRef.current?.cancel();
      writer?.releaseLock();
      writerRef.current?.releaseLock();
    };
  }, [writer]);

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-[0.3em]">Key grid</h2>
            <span className="text-[10px] uppercase tracking-[0.3em] text-black/50">
              Keys 0-15
            </span>
          </div>
          <div className="mt-6 grid grid-flow-col grid-cols-4 grid-rows-4 gap-3">
            {gridKeys.map((keyIndex) => {
              const isSelected = selectedKey === keyIndex;
              const isModifier = isModifierKey(keyIndex);
              const backgroundColor = isModifier ? modifierKeyColor(keyIndex) : baseColorHex;
              return (
                <button
                  key={keyIndex}
                  type="button"
                  onClick={() => setSelectedKey(keyIndex)}
                  className={`group relative flex h-16 w-16 items-center justify-center rounded-lg border text-sm font-semibold uppercase tracking-[0.2em] transition ${
                    isSelected ? 'border-black ring-2 ring-black/60' : 'border-black/15'
                  }`}
                  style={{ backgroundColor }}
                >
                  <span
                    className={`absolute left-2 top-2 text-[10px] font-semibold uppercase tracking-[0.3em] ${
                      isModifier ? 'text-black/80' : 'text-black/70'
                    }`}
                  >
                    {keyIndex}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.3em] text-black/70">
                    {isModifier ? modifierChordTypes[keyIndex] ?? 'mod' : 'note'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
          <h2 className="text-sm uppercase tracking-[0.3em]">Editor</h2>
          <div className="mt-4 space-y-5 text-sm text-black/70">
            {selectedKey === null && (
              <p className="text-xs uppercase tracking-[0.3em] text-black/50">
                Select a key to edit settings.
              </p>
            )}
            {selectedKey !== null && isModifierKey(selectedKey) && (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-black/50">
                  Modifier key {selectedKey}
                </p>
                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em]">
                  Chord type
                  <select
                    className="rounded-full border border-black/20 bg-white px-4 py-2 text-xs uppercase tracking-[0.3em]"
                    value={modifierChordTypes[selectedKey] ?? 'maj'}
                    onChange={(event) =>
                      setModifierChordTypes((prev) => ({
                        ...prev,
                        [selectedKey]: event.target.value,
                      }))
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

            {selectedKey !== null && !isModifierKey(selectedKey) && (
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.3em] text-black/50">
                  Note keys base color
                </p>
                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em]">
                  Hex color
                  <input
                    type="text"
                    value={baseColorHex}
                    onChange={(event) => handleHexChange(event.target.value)}
                    className="rounded-full border border-black/20 bg-white px-4 py-2 text-xs uppercase tracking-[0.3em]"
                  />
                </label>
                <div className="grid grid-cols-3 gap-3 text-xs uppercase tracking-[0.3em]">
                  {(['R', 'G', 'B'] as const).map((label, index) => (
                    <label key={label} className="flex flex-col gap-2">
                      {label}
                      <input
                        type="number"
                        min={0}
                        max={255}
                        value={baseColor[index]}
                        onChange={(event) =>
                          handleBaseColorChange(index, Number(event.target.value))
                        }
                        className="rounded-full border border-black/20 bg-white px-3 py-2 text-xs uppercase tracking-[0.3em]"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleSendToDevice}
              className="w-full rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10"
            >
              Send to device
            </button>
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
