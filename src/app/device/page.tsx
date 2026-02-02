'use client';

import { useState } from 'react';

type SerialConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export default function DevicePage() {
  const [status, setStatus] = useState<SerialConnectionState>('idle');
  const [log, setLog] = useState<string[]>([]);

  const appendLog = (message: string) => {
    setLog((prev) => [message, ...prev].slice(0, 20));
  };

  const handleConnect = async () => {
    if (!('serial' in navigator)) {
      appendLog('Web Serial not supported in this browser.');
      setStatus('error');
      return;
    }

    try {
      setStatus('connecting');
      const port = await navigator.serial.requestPort();
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
    <section className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-white/60">Device</p>
        <h1 className="text-3xl uppercase tracking-[0.3em]">Chord device beta</h1>
        <p className="max-w-2xl text-sm text-white/70">
          This beta tool will configure LED palettes and chord mappings for the handheld
          thx4cmn MIDI device. The full protocol will land in a future release.
        </p>
        <span className="inline-flex rounded-full border border-white/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em]">
          Beta
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={handleConnect}
          className="rounded-full border border-white/40 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-white hover:text-black"
        >
          Connect device
        </button>
        <span className="text-xs uppercase tracking-[0.3em] text-white/60">Status: {status}</span>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-sm uppercase tracking-[0.3em]">Session log</h2>
        <div className="mt-4 space-y-2 text-xs text-white/60">
          {log.length === 0 && <p>No activity yet.</p>}
          {log.map((entry, index) => (
            <p key={index}>{entry}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
