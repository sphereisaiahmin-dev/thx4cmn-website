'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DeviceConnectionState,
  DeviceSerialClient,
  HelloAckPayload,
  ProtocolEvent,
} from '@/lib/deviceSerialClient';

type SessionLogEntry = ProtocolEvent;

const MAX_LOG_ENTRIES = 40;

const formatLogTimestamp = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

export default function DevicePage() {
  const [status, setStatus] = useState<DeviceConnectionState>('idle');
  const [log, setLog] = useState<SessionLogEntry[]>([]);
  const [helloAck, setHelloAck] = useState<HelloAckPayload | null>(null);
  const clientRef = useRef<DeviceSerialClient | null>(null);

  const appendLog = useCallback((entry: SessionLogEntry) => {
    setLog((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, []);

  const handleConnect = useCallback(async () => {
    if (status === 'connecting' || status === 'handshaking') {
      return;
    }

    if (!DeviceSerialClient.isSupported()) {
      setStatus('error');
      appendLog({
        level: 'error',
        message: 'Web Serial is not supported in this browser.',
        timestamp: Date.now(),
      });
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

    try {
      await client.connect();
      setStatus('handshaking');

      const response = await client.handshake();
      setHelloAck(response.payload);
      setStatus('ready');
    } catch (error) {
      console.error(error);
      setStatus('error');

      appendLog({
        level: 'error',
        message: error instanceof Error ? error.message : 'Unable to connect to device.',
        timestamp: Date.now(),
      });

      await client.disconnect();
      clientRef.current = null;
    }
  }, [appendLog, status]);

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

  return (
    <section className="relative space-y-8">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-black/60">Device</p>
        <h1 className="text-3xl uppercase tracking-[0.3em]">thx-c</h1>
        <p className="max-w-2xl text-sm text-black/70">
          USB protocol v1 handshake is now required before any configuration updates. Use the
          connect button to open the serial port and initialize a protocol session.
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
        <span className="text-xs uppercase tracking-[0.3em] text-black/60">Status: {status}</span>
      </div>

      {helloAck && (
        <div className="rounded-2xl border border-black/10 bg-black/5 p-6 text-xs text-black/70">
          <h2 className="text-sm uppercase tracking-[0.3em]">Handshake</h2>
          <p className="mt-3">Device: {helloAck.device}</p>
          <p>Firmware: {helloAck.firmwareVersion}</p>
          <p>Protocol: v{helloAck.protocolVersion}</p>
          <p>Features: {helloAck.features.join(', ')}</p>
        </div>
      )}

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
