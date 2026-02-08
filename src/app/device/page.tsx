'use client';

import { useRef, useState } from 'react';

type SerialConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
type SerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>;
  readable?: ReadableStream<Uint8Array> | null;
  writable?: WritableStream<Uint8Array> | null;
};
type SerialLike = {
  requestPort: () => Promise<SerialPortLike>;
};

const NOTE_KEY_INDICES = Array.from({ length: 12 }, (_, index) => index);
const MODIFIER_KEY_INDICES = [12, 13, 14, 15];
const CHORD_OPTIONS = ['maj', 'min', 'maj7', 'min7', 'maj9', 'min9'] as const;
const DEFAULT_CHORDS: Record<number, (typeof CHORD_OPTIONS)[number]> = {
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
  const [writer, setWriter] = useState<WritableStreamDefaultWriter<Uint8Array> | null>(
    null,
  );
  const [reader, setReader] = useState<ReadableStreamDefaultReader<string> | null>(null);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [baseColor, setBaseColor] = useState<[number, number, number]>([150, 150, 150]);
  const [modifierChords, setModifierChords] =
    useState<Record<number, (typeof CHORD_OPTIONS)[number]>>(DEFAULT_CHORDS);
  const textEncoderRef = useRef(new TextEncoder());
  const incomingBufferRef = useRef('');

  const appendLog = (message: string) => {
    setLog((prev) => [message, ...prev].slice(0, 20));
  };

  const handleIncomingLine = (line: string) => {
    if (!line) {
      return;
    }
    if (line === 'pong') {
      appendLog('Received pong from device.');
      return;
    }
    if (line === 'ok') {
      appendLog('Device acknowledged update.');
      return;
    }
    appendLog(`Device: ${line}`);
  };

  const processIncomingChunk = (chunk: string) => {
    incomingBufferRef.current += chunk;
    const parts = incomingBufferRef.current.split(/\r?\n/);
    incomingBufferRef.current = parts.pop() ?? '';
    for (const line of parts) {
      handleIncomingLine(line.trim());
    }
  };

  const startReadLoop = async (streamReader: ReadableStreamDefaultReader<string>) => {
    try {
      while (true) {
        const { value, done } = await streamReader.read();
        if (done) {
          break;
        }
        if (value) {
          processIncomingChunk(value);
        }
      }
    } catch (error) {
      console.error(error);
      appendLog('Serial reader stopped unexpectedly.');
    }
  };

  const sendRawMessage = async (
    message: string,
    activeWriter: WritableStreamDefaultWriter<Uint8Array> | null = writer,
  ) => {
    if (!activeWriter) {
      return;
    }
    await activeWriter.write(textEncoderRef.current.encode(message));
  };

  const sendPayload = async (payload: Record<string, unknown>) => {
    await sendRawMessage(`${JSON.stringify(payload)}\n`);
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
      const nextPort = await serial.requestPort();
      await nextPort.open({ baudRate: 115200 });
      const nextWriter = nextPort.writable?.getWriter() ?? null;
      setPort(nextPort);
      setWriter(nextWriter);
      appendLog('Connected to device.');
      setStatus('connected');

      if (nextPort.readable) {
        const textDecoder = new TextDecoderStream();
        nextPort.readable.pipeTo(textDecoder.writable).catch((error) => {
          console.error(error);
          appendLog('Serial reader closed unexpectedly.');
        });
        const nextReader = textDecoder.readable.getReader();
        setReader(nextReader);
        appendLog('Listening for device responses.');
        void startReadLoop(nextReader);
      }

      await sendRawMessage('ping\n', nextWriter);
      appendLog('Sent ping payload.');
    } catch (error) {
      console.error(error);
      setStatus('error');
      appendLog('Unable to connect to device.');
    }
  };

  const handleChordChange = async (
    keyIndex: number,
    chord: (typeof CHORD_OPTIONS)[number],
  ) => {
    setModifierChords((prev) => ({ ...prev, [keyIndex]: chord }));
    await sendPayload({ chords: { [keyIndex]: chord } });
  };

  const clampColorValue = (value: number) => Math.max(0, Math.min(255, value));

  const updateBaseColor = (channel: number, value: number) => {
    const nextColor: [number, number, number] = [...baseColor] as [
      number,
      number,
      number,
    ];
    nextColor[channel] = clampColorValue(value);
    setBaseColor(nextColor);
    void sendPayload({ baseColor: nextColor });
  };

  const selectedIsModifier = selectedKey !== null && MODIFIER_KEY_INDICES.includes(selectedKey);
  const selectedIsNote = selectedKey !== null && NOTE_KEY_INDICES.includes(selectedKey);
  const connectionDetail = [
    port ? 'port ready' : null,
    reader ? 'listening' : null,
  ].filter(Boolean);

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
          disabled={status === 'connecting' || status === 'connected'}
          className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10"
        >
          Connect device
        </button>
        <span className="text-xs uppercase tracking-[0.3em] text-black/60">
          Status: {status}
          {connectionDetail.length > 0 ? ` (${connectionDetail.join(', ')})` : ''}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-black/60">Key grid</p>
            <h2 className="text-lg uppercase tracking-[0.2em]">Select a key</h2>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 16 }, (_, index) => {
              const isModifier = MODIFIER_KEY_INDICES.includes(index);
              const isSelected = selectedKey === index;
              const baseStyle = !isModifier
                ? { backgroundColor: `rgb(${baseColor.join(',')})` }
                : undefined;
              const chordLabel = isModifier ? modifierChords[index] ?? '—' : null;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelectedKey(index)}
                  style={baseStyle}
                  className={`aspect-square rounded-2xl border px-2 py-3 text-center text-xs uppercase tracking-[0.2em] transition ${
                    isSelected
                      ? 'border-black ring-2 ring-black/40'
                      : 'border-black/20 hover:border-black/40'
                  } ${isModifier ? 'bg-black/10 text-black' : 'text-black'}`}
                >
                  <div className="text-[10px]">Key {index}</div>
                  {isModifier && (
                    <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-black/70">
                      {`Mod ${index}`}
                      <div className="mt-1 text-[10px] normal-case tracking-[0.1em] text-black/70">
                        {chordLabel}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-black/10 bg-black/5 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-black/60">Editor</p>
            <h2 className="text-lg uppercase tracking-[0.2em]">Key settings</h2>
          </div>
          {selectedKey === null && (
            <p className="text-sm text-black/60">
              Select a key to edit its chord type or base color.
            </p>
          )}
          {selectedIsModifier && selectedKey !== null && (
            <div className="space-y-3 text-sm text-black/70">
              <p className="text-xs uppercase tracking-[0.3em] text-black/60">
                Modifier key {selectedKey}
              </p>
              <label className="text-xs uppercase tracking-[0.3em] text-black/60">
                Chord type
              </label>
              <select
                value={modifierChords[selectedKey]}
                onChange={(event) =>
                  void handleChordChange(selectedKey, event.target.value as typeof CHORD_OPTIONS[number])
                }
                className="w-full rounded-xl border border-black/20 bg-white px-3 py-2 text-sm uppercase tracking-[0.2em]"
              >
                {CHORD_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selectedIsNote && (
            <div className="space-y-4 text-sm text-black/70">
              <p className="text-xs uppercase tracking-[0.3em] text-black/60">
                Base color (keys 0-11)
              </p>
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-lg border border-black/20"
                  style={{ backgroundColor: `rgb(${baseColor.join(',')})` }}
                />
                <p className="text-xs uppercase tracking-[0.2em] text-black/60">
                  RGB {baseColor.join(', ')}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['R', 'G', 'B'] as const).map((label, channel) => (
                  <label key={label} className="space-y-2 text-xs uppercase tracking-[0.2em]">
                    <span className="text-black/60">{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={baseColor[channel]}
                      onChange={(event) =>
                        updateBaseColor(channel, Number(event.target.value))
                      }
                      className="w-full rounded-lg border border-black/20 px-2 py-2 text-sm"
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
