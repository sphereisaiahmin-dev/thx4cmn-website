'use client';

import { useState } from 'react';

type SerialConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
type SerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>;
  writable?: WritableStream<Uint8Array> | null;
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

  const appendLog = (message: string) => {
    setLog((prev) => [message, ...prev].slice(0, 20));
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
      const port = await serial.requestPort();
      await port.open({ baudRate: 115200 });
      appendLog('Connected to device.');
      setStatus('connected');

      const textEncoder = new TextEncoder();
      const writer = port.writable?.getWriter();
      await writer?.write(textEncoder.encode('ping'));
      writer?.releaseLock();
      appendLog('Sent ping payload.');
    } catch (error) {
      console.error(error);
      setStatus('error');
      appendLog('Unable to connect to device.');
    }
  };

  return (
    <section className="relative">
      <div className="space-y-8 blur-sm pointer-events-none select-none">
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

        <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
          <h2 className="text-sm uppercase tracking-[0.3em]">Session log</h2>
          <div className="mt-4 space-y-2 text-xs text-black/60">
            {log.length === 0 && <p>No activity yet.</p>}
            {log.map((entry, index) => (
              <p key={index}>{entry}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border border-black/20 bg-white/80 px-6 py-3 text-xs uppercase tracking-[0.4em] text-black/70 shadow-sm">
          Coming soon…
        </div>
      </div>
    </section>
  );
}
