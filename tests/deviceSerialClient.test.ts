import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEVICE_PROTOCOL_VERSION,
  DeviceSerialClient,
} from '../src/lib/deviceSerialClient.ts';
import type { DeviceEnvelope, SerialLike, SerialPortLike } from '../src/lib/deviceSerialClient.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type HostFrameHandler = (frame: DeviceEnvelope, port: MockSerialPort) => void;

class MockSerialPort implements SerialPortLike {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;

  private readableController: ReadableStreamDefaultController<Uint8Array> | null = null;
  private readonly onHostFrame: HostFrameHandler;
  private outboundBuffer = '';

  receivedHostFrames: DeviceEnvelope[] = [];

  constructor(onHostFrame: HostFrameHandler) {
    this.onHostFrame = onHostFrame;

    this.readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.readableController = controller;
      },
    });

    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        this.outboundBuffer += decoder.decode(chunk, { stream: true });
        this.flushOutboundLines();
      },
    });
  }

  async open() {
    return;
  }

  async close() {
    this.readableController?.close();
  }

  pushDeviceFrame(frame: DeviceEnvelope) {
    const line = `${JSON.stringify(frame)}\n`;
    this.readableController?.enqueue(encoder.encode(line));
  }

  private flushOutboundLines() {
    while (true) {
      const newlineIndex = this.outboundBuffer.indexOf('\n');
      if (newlineIndex < 0) {
        return;
      }

      const line = this.outboundBuffer.slice(0, newlineIndex);
      this.outboundBuffer = this.outboundBuffer.slice(newlineIndex + 1);

      if (!line) {
        continue;
      }

      const frame = JSON.parse(line) as DeviceEnvelope;
      this.receivedHostFrames.push(frame);
      this.onHostFrame(frame, this);
    }
  }
}

class MockSerial implements SerialLike {
  private readonly port: MockSerialPort;

  constructor(port: MockSerialPort) {
    this.port = port;
  }

  async requestPort() {
    return this.port;
  }
}

const baseHelloAckPayload = {
  device: 'thx-c pico midi',
  protocolVersion: DEVICE_PROTOCOL_VERSION,
  features: ['handshake'],
  firmwareVersion: '1.0.0',
};

test('handshake success', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type !== 'hello') {
      return;
    }

    currentPort.pushDeviceFrame({
      v: DEVICE_PROTOCOL_VERSION,
      type: 'hello_ack',
      id: frame.id,
      ts: Date.now(),
      payload: baseHelloAckPayload,
    });
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 100,
    backoffBaseMs: 1,
    handshakeAttempts: 3,
  });

  await client.connect();
  const helloAck = await client.handshake();

  assert.equal(helloAck.type, 'hello_ack');
  assert.equal(helloAck.payload.device, 'thx-c pico midi');
  assert.equal(port.receivedHostFrames.length, 1);

  await client.disconnect();
});

test('handshake timeout retries and final failure', async () => {
  const port = new MockSerialPort(() => {
    // Device never responds.
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 25,
    backoffBaseMs: 1,
    handshakeAttempts: 3,
  });

  await client.connect();

  await assert.rejects(async () => {
    await client.handshake();
  }, /Timed out waiting for response to hello/);

  assert.equal(port.receivedHostFrames.length, 3);

  await client.disconnect();
});

test('handshake retries on malformed hello_ack and fails', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type !== 'hello') {
      return;
    }

    currentPort.pushDeviceFrame({
      v: DEVICE_PROTOCOL_VERSION,
      type: 'hello_ack',
      id: frame.id,
      ts: Date.now(),
      payload: {
        ...baseHelloAckPayload,
        features: 'handshake',
      },
    });
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 100,
    backoffBaseMs: 1,
    handshakeAttempts: 3,
  });

  await client.connect();

  await assert.rejects(async () => {
    await client.handshake();
  }, /hello_ack payload is malformed/);

  assert.equal(port.receivedHostFrames.length, 3);

  await client.disconnect();
});

test('handshake ignores mismatched ids and times out', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type !== 'hello') {
      return;
    }

    currentPort.pushDeviceFrame({
      v: DEVICE_PROTOCOL_VERSION,
      type: 'hello_ack',
      id: `${frame.id}-unexpected`,
      ts: Date.now(),
      payload: baseHelloAckPayload,
    });
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 30,
    backoffBaseMs: 1,
    handshakeAttempts: 3,
  });

  await client.connect();

  await assert.rejects(async () => {
    await client.handshake();
  }, /Timed out waiting for response to hello/);

  assert.equal(port.receivedHostFrames.length, 3);

  await client.disconnect();
});
