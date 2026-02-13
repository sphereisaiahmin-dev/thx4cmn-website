import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEVICE_PROTOCOL_VERSION,
  DeviceSerialClient,
  type DeviceEnvelope,
  type DeviceState,
  type SerialLike,
  type SerialPortLike,
} from '../src/lib/deviceSerialClient.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type HostFrameHandler = (frame: DeviceEnvelope, port: MockSerialPort) => void;

const baseState: DeviceState = {
  notePreset: {
    mode: 'piano',
    piano: {
      whiteKeyColor: '#969696',
      blackKeyColor: '#46466e',
    },
    gradient: {
      colorA: '#ff4b5a',
      colorB: '#559bff',
      speed: 1,
    },
    rain: {
      colorA: '#56d18d',
      colorB: '#559bff',
      speed: 1,
    },
  },
  modifierChords: {
    '12': 'min7',
    '13': 'maj7',
    '14': 'min',
    '15': 'maj',
  },
};

const legacyState = {
  showBlackKeys: false,
  modifierChords: {
    '12': 'min7',
    '13': 'maj7',
    '14': 'min',
    '15': 'maj',
  },
};

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

  pushRawLine(line: string) {
    this.readableController?.enqueue(encoder.encode(`${line}\n`));
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

const buildHelloAckPayload = (state: unknown = baseState) => ({
  device: 'thx-c',
  protocolVersion: DEVICE_PROTOCOL_VERSION,
  features: ['handshake', 'get_state', 'apply_config', 'ping', 'note_presets_v1', 'firmware_update_v1'],
  firmwareVersion: '0.9.0',
  state,
});

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
      payload: buildHelloAckPayload(),
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
  assert.equal(helloAck.payload.device, 'thx-c');
  assert.deepEqual(helloAck.payload.state, baseState);
  assert.equal(port.receivedHostFrames.length, 1);

  await client.disconnect();
});

test('handshake accepts and migrates legacy state payload', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type !== 'hello') {
      return;
    }

    currentPort.pushDeviceFrame({
      v: DEVICE_PROTOCOL_VERSION,
      type: 'hello_ack',
      id: frame.id,
      ts: Date.now(),
      payload: buildHelloAckPayload(legacyState),
    });
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 100,
    backoffBaseMs: 1,
    handshakeAttempts: 2,
  });

  await client.connect();
  const helloAck = await client.handshake();

  assert.equal(helloAck.payload.state.notePreset.mode, 'piano');
  assert.equal(
    helloAck.payload.state.notePreset.piano.blackKeyColor,
    helloAck.payload.state.notePreset.piano.whiteKeyColor,
  );
  assert.equal(helloAck.payload.state.modifierChords['12'], 'min7');

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
    handshakeRequestTimeoutMs: 25,
  });

  await client.connect();

  await assert.rejects(async () => {
    await client.handshake();
  }, /Timed out waiting for response to hello/);

  assert.equal(port.receivedHostFrames.length, 3);

  await client.disconnect();
});

test('get_state success', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type === 'hello') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'hello_ack',
        id: frame.id,
        ts: Date.now(),
        payload: buildHelloAckPayload(),
      });
      return;
    }

    if (frame.type === 'get_state') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'ack',
        id: frame.id,
        ts: Date.now(),
        payload: {
          requestType: 'get_state',
          status: 'ok',
          state: baseState,
        },
      });
    }
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 100,
    backoffBaseMs: 1,
    handshakeAttempts: 2,
  });

  await client.connect();
  await client.handshake();

  const state = await client.getState();
  assert.deepEqual(state, baseState);

  await client.disconnect();
});

test('get_state response migrates legacy state payload', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type === 'hello') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'hello_ack',
        id: frame.id,
        ts: Date.now(),
        payload: buildHelloAckPayload(),
      });
      return;
    }

    if (frame.type === 'get_state') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'ack',
        id: frame.id,
        ts: Date.now(),
        payload: {
          requestType: 'get_state',
          status: 'ok',
          state: legacyState,
        },
      });
    }
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 100,
    backoffBaseMs: 1,
    handshakeAttempts: 2,
  });

  await client.connect();
  await client.handshake();

  const state = await client.getState();
  assert.equal(state.notePreset.mode, 'piano');
  assert.equal(state.notePreset.piano.blackKeyColor, state.notePreset.piano.whiteKeyColor);

  await client.disconnect();
});

test('get_state ignores mismatched ids and times out', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type === 'hello') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'hello_ack',
        id: frame.id,
        ts: Date.now(),
        payload: buildHelloAckPayload(),
      });
      return;
    }

    if (frame.type === 'get_state') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'ack',
        id: `${frame.id}-unexpected`,
        ts: Date.now(),
        payload: {
          requestType: 'get_state',
          status: 'ok',
          state: baseState,
        },
      });
    }
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 30,
    backoffBaseMs: 1,
    handshakeAttempts: 2,
  });

  await client.connect();
  await client.handshake();

  await assert.rejects(async () => {
    await client.getState();
  }, /Timed out waiting for response to get_state/);

  await client.disconnect();
});

test('apply_config success', async () => {
  const nextState: DeviceState = {
    notePreset: {
      mode: 'gradient',
      piano: {
        whiteKeyColor: '#f0f0f0',
        blackKeyColor: '#101030',
      },
      gradient: {
        colorA: '#ff8844',
        colorB: '#3388ff',
        speed: 2.2,
      },
      rain: {
        colorA: '#56d18d',
        colorB: '#559bff',
        speed: 1,
      },
    },
    modifierChords: {
      '12': 'min79',
      '13': 'maj7',
      '14': 'min',
      '15': 'maj79',
    },
  };

  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type === 'hello') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'hello_ack',
        id: frame.id,
        ts: Date.now(),
        payload: buildHelloAckPayload(),
      });
      return;
    }

    if (frame.type === 'apply_config') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'ack',
        id: frame.id,
        ts: Date.now(),
        payload: {
          requestType: 'apply_config',
          status: 'ok',
          state: nextState,
          appliedConfigId: (frame.payload as { configId: string }).configId,
        },
      });
    }
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 100,
    backoffBaseMs: 1,
    handshakeAttempts: 2,
  });

  await client.connect();
  await client.handshake();

  const result = await client.applyConfig(nextState, {
    configId: 'cfg-1',
    idempotencyKey: 'idem-1',
  });

  assert.deepEqual(result.state, nextState);
  assert.equal(result.appliedConfigId, 'cfg-1');

  await client.disconnect();
});

test('apply_config rejects invalid color format before send', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type === 'hello') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'hello_ack',
        id: frame.id,
        ts: Date.now(),
        payload: buildHelloAckPayload(),
      });
    }
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 100,
    backoffBaseMs: 1,
    handshakeAttempts: 2,
  });

  await client.connect();
  await client.handshake();

  const invalidState = {
    ...baseState,
    notePreset: {
      ...baseState.notePreset,
      piano: {
        ...baseState.notePreset.piano,
        whiteKeyColor: '#zzzzzz',
      },
    },
  } as unknown as DeviceState;

  await assert.rejects(async () => {
    await client.applyConfig(invalidState);
  }, /Configuration payload is invalid/);

  const applyFrames = port.receivedHostFrames.filter((frame) => frame.type === 'apply_config');
  assert.equal(applyFrames.length, 0);

  await client.disconnect();
});

test('apply_config rejects out-of-range speed before send', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type === 'hello') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'hello_ack',
        id: frame.id,
        ts: Date.now(),
        payload: buildHelloAckPayload(),
      });
    }
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 100,
    backoffBaseMs: 1,
    handshakeAttempts: 2,
  });

  await client.connect();
  await client.handshake();

  const invalidState = {
    ...baseState,
    notePreset: {
      ...baseState.notePreset,
      gradient: {
        ...baseState.notePreset.gradient,
        speed: 4,
      },
    },
  } as unknown as DeviceState;

  await assert.rejects(async () => {
    await client.applyConfig(invalidState);
  }, /Configuration payload is invalid/);

  const applyFrames = port.receivedHostFrames.filter((frame) => frame.type === 'apply_config');
  assert.equal(applyFrames.length, 0);

  await client.disconnect();
});

test('apply_config nack is surfaced', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type === 'hello') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'hello_ack',
        id: frame.id,
        ts: Date.now(),
        payload: buildHelloAckPayload(),
      });
      return;
    }

    if (frame.type === 'apply_config') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'nack',
        id: frame.id,
        ts: Date.now(),
        payload: {
          requestType: 'apply_config',
          code: 'invalid_config',
          reason: 'Config is invalid.',
          retryable: false,
        },
      });
    }
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 100,
    backoffBaseMs: 1,
    handshakeAttempts: 2,
  });

  await client.connect();
  await client.handshake();

  await assert.rejects(async () => {
    await client.applyConfig({
      ...baseState,
      modifierChords: {
        ...baseState.modifierChords,
        '12': 'maj9',
      },
    });
  }, /Config is invalid/);

  await client.disconnect();
});

test('disconnect rejects pending request', async () => {
  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type === 'hello') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'hello_ack',
        id: frame.id,
        ts: Date.now(),
        payload: buildHelloAckPayload(),
      });
      return;
    }

    if (frame.type === 'get_state') {
      // Intentionally do not respond.
    }
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 500,
    backoffBaseMs: 1,
    handshakeAttempts: 2,
  });

  await client.connect();
  await client.handshake();

  const pendingState = client.getState();
  await client.disconnect();

  await assert.rejects(async () => {
    await pendingState;
  }, /Connection closed/);
});

test('handshake recovers from serial preamble and late hello_ack correlation mismatch', async () => {
  let helloCount = 0;

  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type !== 'hello') {
      return;
    }

    helloCount += 1;

    if (helloCount === 1) {
      currentPort.pushRawLine('code.py output:');
      setTimeout(() => {
        currentPort.pushDeviceFrame({
          v: DEVICE_PROTOCOL_VERSION,
          type: 'hello_ack',
          id: frame.id,
          ts: Date.now(),
          payload: buildHelloAckPayload(),
        });
      }, 45);
      return;
    }

    // no-op: fallback should correlate the late hello_ack to this pending attempt
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 25,
    backoffBaseMs: 1,
    handshakeAttempts: 3,
    handshakeRequestTimeoutMs: 25,
  });

  await client.connect();
  const helloAck = await client.handshake();

  assert.equal(helloAck.type, 'hello_ack');
  assert.equal(helloAck.payload.firmwareVersion, '0.9.0');
  assert.ok(port.receivedHostFrames.length >= 2);

  await client.disconnect();
});

test('flashFirmwarePackage sends firmware update sequence', async () => {
  const stageA = encoder.encode('print("a")');
  const stageB = encoder.encode('print("b")');

  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type === 'hello') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'hello_ack',
        id: frame.id,
        ts: Date.now(),
        payload: buildHelloAckPayload(),
      });
      return;
    }

    if (
      frame.type === 'firmware_begin' ||
      frame.type === 'firmware_chunk' ||
      frame.type === 'firmware_file_complete' ||
      frame.type === 'firmware_commit' ||
      frame.type === 'firmware_abort'
    ) {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'ack',
        id: frame.id,
        ts: Date.now(),
        payload: {
          requestType: frame.type,
          status: 'ok',
        },
      });
    }
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 100,
    backoffBaseMs: 1,
    handshakeAttempts: 2,
  });

  await client.connect();
  await client.handshake();

  await client.flashFirmwarePackage({
    version: '0.9.1',
    files: [
      {
        path: '/code.py',
        contentBase64: Buffer.from(stageA).toString('base64'),
        sha256: 'a'.repeat(64),
      },
      {
        path: '/protocol_v1.py',
        contentBase64: Buffer.from(stageB).toString('base64'),
        sha256: 'b'.repeat(64),
      },
    ],
  });

  const firmwareBeginFrames = port.receivedHostFrames.filter((frame) => frame.type === 'firmware_begin');
  const firmwareChunkFrames = port.receivedHostFrames.filter((frame) => frame.type === 'firmware_chunk');
  const firmwareCompleteFrames = port.receivedHostFrames.filter(
    (frame) => frame.type === 'firmware_file_complete',
  );
  const firmwareCommitFrames = port.receivedHostFrames.filter((frame) => frame.type === 'firmware_commit');

  assert.equal(firmwareBeginFrames.length, 1);
  assert.ok(firmwareChunkFrames.length >= 2);
  assert.equal(firmwareCompleteFrames.length, 2);
  assert.equal(firmwareCommitFrames.length, 1);

  await client.disconnect();
});

test('flashFirmwarePackage tolerates delayed firmware_begin ack with firmware timeout override', async () => {
  const stageA = encoder.encode('print("compat")');

  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type === 'hello') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'hello_ack',
        id: frame.id,
        ts: Date.now(),
        payload: buildHelloAckPayload(),
      });
      return;
    }

    if (frame.type === 'firmware_begin') {
      setTimeout(() => {
        currentPort.pushDeviceFrame({
          v: DEVICE_PROTOCOL_VERSION,
          type: 'ack',
          id: frame.id,
          ts: Date.now(),
          payload: {
            requestType: 'firmware_begin',
            status: 'ok',
          },
        });
      }, 80);
      return;
    }

    if (
      frame.type === 'firmware_chunk' ||
      frame.type === 'firmware_file_complete' ||
      frame.type === 'firmware_commit' ||
      frame.type === 'firmware_abort'
    ) {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'ack',
        id: frame.id,
        ts: Date.now(),
        payload: {
          requestType: frame.type,
          status: 'ok',
        },
      });
    }
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 30,
    firmwareRequestTimeoutMs: 180,
    backoffBaseMs: 1,
    handshakeAttempts: 2,
  });

  await client.connect();
  await client.handshake();

  await client.flashFirmwarePackage({
    version: '0.9.1',
    files: [
      {
        path: '/code.py',
        contentBase64: Buffer.from(stageA).toString('base64'),
        sha256: 'd'.repeat(64),
      },
    ],
  });

  const firmwareBeginFrames = port.receivedHostFrames.filter((frame) => frame.type === 'firmware_begin');
  assert.equal(firmwareBeginFrames.length, 1);

  await client.disconnect();
});

test('flashFirmwarePackage retries firmware_begin once after timeout', async () => {
  const stageA = encoder.encode('print("retry")');
  let firmwareBeginAttempts = 0;

  const port = new MockSerialPort((frame, currentPort) => {
    if (frame.type === 'hello') {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'hello_ack',
        id: frame.id,
        ts: Date.now(),
        payload: buildHelloAckPayload(),
      });
      return;
    }

    if (frame.type === 'firmware_begin') {
      firmwareBeginAttempts += 1;
      if (firmwareBeginAttempts >= 2) {
        currentPort.pushDeviceFrame({
          v: DEVICE_PROTOCOL_VERSION,
          type: 'ack',
          id: frame.id,
          ts: Date.now(),
          payload: {
            requestType: 'firmware_begin',
            status: 'ok',
          },
        });
      }
      return;
    }

    if (
      frame.type === 'firmware_chunk' ||
      frame.type === 'firmware_file_complete' ||
      frame.type === 'firmware_commit' ||
      frame.type === 'firmware_abort'
    ) {
      currentPort.pushDeviceFrame({
        v: DEVICE_PROTOCOL_VERSION,
        type: 'ack',
        id: frame.id,
        ts: Date.now(),
        payload: {
          requestType: frame.type,
          status: 'ok',
        },
      });
    }
  });

  const client = new DeviceSerialClient({
    serial: new MockSerial(port),
    requestTimeoutMs: 25,
    firmwareRequestTimeoutMs: 25,
    firmwareBeginAttempts: 2,
    backoffBaseMs: 1,
    handshakeAttempts: 2,
  });

  await client.connect();
  await client.handshake();

  await client.flashFirmwarePackage({
    version: '0.9.1',
    files: [
      {
        path: '/code.py',
        contentBase64: Buffer.from(stageA).toString('base64'),
        sha256: 'e'.repeat(64),
      },
    ],
  });

  const firmwareBeginFrames = port.receivedHostFrames.filter((frame) => frame.type === 'firmware_begin');
  assert.equal(firmwareBeginFrames.length, 2);

  await client.disconnect();
});
