import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEVICE_PROTOCOL_VERSION,
  DeviceSerialClient,
  type ApplyConfigPayload,
} from '../src/lib/deviceSerialClient.ts';
import {
  DEFAULT_MODIFIER_CHORDS,
  DEFAULT_NOTE_PRESETS,
} from '../src/lib/deviceConfig.ts';
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

  countHostFrames(type: string) {
    return this.receivedHostFrames.filter((frame) => frame.type === type).length;
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
  features: ['handshake', 'apply_config'],
  firmwareVersion: '1.1.0',
};

const buildApplyConfigPayload = (configVersion = 1): ApplyConfigPayload => ({
  modifierChords: { ...DEFAULT_MODIFIER_CHORDS },
  noteKeyColorPresets: { ...DEFAULT_NOTE_PRESETS },
  idempotencyKey: `cfg-${configVersion}`,
  configVersion,
});

const createClient = (port: MockSerialPort) =>
  new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 50,
    backoffBaseMs: 1,
    handshakeAttempts: 3,
    applyConfigAttempts: 3,
  });

const autoHelloAck = (frame: DeviceEnvelope, currentPort: MockSerialPort) => {
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
};

test('handshake success', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    autoHelloAck(frame, currentPort);
  });

  const client = createClient(port);

  await client.connect();
  const helloAck = await client.handshake();

  assert.equal(helloAck.type, 'hello_ack');
  assert.equal(helloAck.payload.device, 'thx-c pico midi');
  assert.equal(port.countHostFrames('hello'), 1);

  await client.disconnect();
});

test('handshake timeout retries and final failure', async () => {
  const port = new MockSerialPort(() => {
    // Device never responds.
  });

  const client = createClient(port);

  await client.connect();

  await assert.rejects(async () => {
    await client.handshake();
  }, /Timed out waiting for response to hello/);

  assert.equal(port.countHostFrames('hello'), 3);

  await client.disconnect();
});

test('apply_config success with ack', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    autoHelloAck(frame, currentPort);

    if (frame.type === 'apply_config') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'ack',
        id: frame.id,
        ts: Date.now(),
        payload: {
          requestType: 'apply_config',
          status: 'ok',
          appliedConfigVersion: 9,
        },
      });
    }
  });

  const client = createClient(port);
  await client.connect();
  await client.handshake();

  const ack = await client.sendApplyConfig(buildApplyConfigPayload(9));

  assert.equal(ack.type, 'ack');
  assert.equal(ack.payload.appliedConfigVersion, 9);
  assert.equal(port.countHostFrames('apply_config'), 1);

  await client.disconnect();
});

test('apply_config nack handling stops on non-retryable nack', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    autoHelloAck(frame, currentPort);

    if (frame.type === 'apply_config') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'nack',
        id: frame.id,
        ts: Date.now(),
        payload: {
          requestType: 'apply_config',
          code: 'invalid_chord',
          reason: 'Unsupported chord.',
          retryable: false,
        },
      });
    }
  });

  const client = createClient(port);
  await client.connect();
  await client.handshake();

  await assert.rejects(async () => {
    await client.sendApplyConfig(buildApplyConfigPayload(3));
  }, /Config rejected: Unsupported chord/);

  assert.equal(port.countHostFrames('apply_config'), 1);

  await client.disconnect();
});

test('apply_config timeout retries and final failure', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    autoHelloAck(frame, currentPort);
    // apply_config intentionally ignored
  });

  const client = createClient(port);
  await client.connect();
  await client.handshake();

  await assert.rejects(async () => {
    await client.sendApplyConfig(buildApplyConfigPayload(7));
  }, /Timed out waiting for response to apply_config/);

  assert.equal(port.countHostFrames('apply_config'), 3);

  await client.disconnect();
});

test('apply_config retries on malformed ack and fails', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    autoHelloAck(frame, currentPort);

    if (frame.type === 'apply_config') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'ack',
        id: frame.id,
        ts: Date.now(),
        payload: {
          requestType: 'apply_config',
          status: 'ok',
          appliedConfigVersion: '9',
        },
      });
    }
  });

  const client = createClient(port);
  await client.connect();
  await client.handshake();

  await assert.rejects(async () => {
    await client.sendApplyConfig(buildApplyConfigPayload(9));
  }, /ack payload is malformed/);

  assert.equal(port.countHostFrames('apply_config'), 3);

  await client.disconnect();
});

test('apply_config retries on malformed nack and fails', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    autoHelloAck(frame, currentPort);

    if (frame.type === 'apply_config') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'nack',
        id: frame.id,
        ts: Date.now(),
        payload: {
          requestType: 'apply_config',
          code: 'invalid_preset',
          reason: 'Bad payload.',
        },
      });
    }
  });

  const client = createClient(port);
  await client.connect();
  await client.handshake();

  await assert.rejects(async () => {
    await client.sendApplyConfig(buildApplyConfigPayload(10));
  }, /nack payload is malformed/);

  assert.equal(port.countHostFrames('apply_config'), 3);

  await client.disconnect();
});

test('apply_config ignores mismatched ids and times out', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    autoHelloAck(frame, currentPort);

    if (frame.type === 'apply_config') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'ack',
        id: `${frame.id}-unexpected`,
        ts: Date.now(),
        payload: {
          requestType: 'apply_config',
          status: 'ok',
          appliedConfigVersion: 9,
        },
      });
    }
  });

  const client = createClient(port);
  await client.connect();
  await client.handshake();

  await assert.rejects(async () => {
    await client.sendApplyConfig(buildApplyConfigPayload(9));
  }, /Timed out waiting for response to apply_config/);

  assert.equal(port.countHostFrames('apply_config'), 3);

  await client.disconnect();
});
