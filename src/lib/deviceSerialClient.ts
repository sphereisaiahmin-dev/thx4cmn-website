export const DEVICE_PROTOCOL_VERSION = 1;
export const DEVICE_PROTOCOL_MAX_FRAME_SIZE = 1024;

export type DeviceConnectionState =
  | 'idle'
  | 'connecting'
  | 'handshaking'
  | 'ready'
  | 'error';

export type DeviceMessageType =
  | 'hello'
  | 'hello_ack'
  | 'error'
  | 'apply_config'
  | 'ack'
  | 'nack';

export type EnvelopePayload = Record<string, unknown>;

export interface DeviceEnvelope<
  TType extends DeviceMessageType = DeviceMessageType,
  TPayload extends EnvelopePayload = EnvelopePayload,
> {
  v: number;
  type: TType;
  id: string;
  ts: number;
  payload: TPayload;
}

export interface HelloPayload extends EnvelopePayload {
  client: string;
  requestedProtocolVersion: number;
}

export interface HelloMessage extends DeviceEnvelope<'hello', HelloPayload> {}

export interface HelloAckPayload extends EnvelopePayload {
  device: string;
  protocolVersion: number;
  features: string[];
  firmwareVersion: string;
}

export interface HelloAckMessage extends DeviceEnvelope<'hello_ack', HelloAckPayload> {}

export interface DeviceErrorPayload extends EnvelopePayload {
  code: string;
  message: string;
  details?: EnvelopePayload;
}

export interface DeviceErrorMessage extends DeviceEnvelope<'error', DeviceErrorPayload> {}

export interface ApplyConfigPayload extends EnvelopePayload {
  configId: string;
  idempotencyKey: string;
  config: EnvelopePayload;
}

export interface ApplyConfigMessage extends DeviceEnvelope<'apply_config', ApplyConfigPayload> {}

export interface AckPayload extends EnvelopePayload {
  requestType: string;
  status: 'ok';
}

export interface AckMessage extends DeviceEnvelope<'ack', AckPayload> {}

export interface NackPayload extends EnvelopePayload {
  requestType: string;
  code: string;
  reason: string;
  retryable: boolean;
}

export interface NackMessage extends DeviceEnvelope<'nack', NackPayload> {}

export interface ProtocolEvent {
  level: 'info' | 'error';
  message: string;
  timestamp: number;
}

export type ProtocolEventHandler = (event: ProtocolEvent) => void;

export type SerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>;
  close?: () => Promise<void>;
  readable?: ReadableStream<Uint8Array> | null;
  writable?: WritableStream<Uint8Array> | null;
};

export type SerialLike = {
  requestPort: () => Promise<SerialPortLike>;
};

export interface DeviceSerialClientOptions {
  serial?: SerialLike | null;
  baudRate?: number;
  clientName?: string;
  requestTimeoutMs?: number;
  handshakeAttempts?: number;
  backoffBaseMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onEvent?: ProtocolEventHandler;
}

const DEFAULT_BAUD_RATE = 115200;
const DEFAULT_REQUEST_TIMEOUT_MS = 1200;
const DEFAULT_HANDSHAKE_ATTEMPTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 250;

const getDefaultSerial = (): SerialLike | null => {
  if (typeof navigator === 'undefined' || !('serial' in navigator)) {
    return null;
  }

  return (navigator as Navigator & { serial: SerialLike }).serial;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

let fallbackRequestCounter = 0;

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  fallbackRequestCounter += 1;
  return `req-${Date.now()}-${fallbackRequestCounter}`;
};

const isObject = (value: unknown): value is EnvelopePayload =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validateEnvelope = (candidate: unknown): DeviceEnvelope | null => {
  if (!isObject(candidate)) {
    return null;
  }

  const { v, type, id, ts, payload } = candidate;
  if (v !== DEVICE_PROTOCOL_VERSION) {
    return null;
  }
  if (typeof type !== 'string') {
    return null;
  }
  if (typeof id !== 'string' || id.length === 0) {
    return null;
  }
  if (typeof ts !== 'number' || Number.isNaN(ts)) {
    return null;
  }
  if (!isObject(payload)) {
    return null;
  }

  return candidate as DeviceEnvelope;
};

const extractIdFromCandidate = (candidate: unknown): string | null => {
  if (!isObject(candidate)) {
    return null;
  }

  const id = candidate.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
};

const validateHelloAckPayload = (payload: EnvelopePayload): payload is HelloAckPayload => {
  const features = payload.features;
  return (
    typeof payload.device === 'string' &&
    typeof payload.protocolVersion === 'number' &&
    Array.isArray(features) &&
    features.every((feature) => typeof feature === 'string') &&
    typeof payload.firmwareVersion === 'string'
  );
};

class DeviceClientError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DeviceClientError';
    this.code = code;
  }
}

type PendingRequest = {
  expectedTypes: Set<DeviceMessageType>;
  resolve: (message: DeviceEnvelope) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export class DeviceSerialClient {
  private readonly serial: SerialLike | null;
  private readonly baudRate: number;
  private readonly clientName: string;
  private readonly requestTimeoutMs: number;
  private readonly handshakeAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onEvent?: ProtocolEventHandler;

  private port: SerialPortLike | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readLoopPromise: Promise<void> | null = null;
  private disposed = false;
  private inboundTextBuffer = '';
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  private readonly pending = new Map<string, PendingRequest>();

  constructor(options: DeviceSerialClientOptions = {}) {
    this.serial = options.serial ?? getDefaultSerial();
    this.baudRate = options.baudRate ?? DEFAULT_BAUD_RATE;
    this.clientName = options.clientName ?? 'thx4cmn-website';
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.handshakeAttempts = options.handshakeAttempts ?? DEFAULT_HANDSHAKE_ATTEMPTS;
    this.backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? defaultSleep;
    this.onEvent = options.onEvent;
  }

  static isSupported() {
    return getDefaultSerial() !== null;
  }

  emit(event: Omit<ProtocolEvent, 'timestamp'>) {
    this.onEvent?.({ ...event, timestamp: this.now() });
  }

  async connect() {
    if (!this.serial) {
      throw new DeviceClientError('serial_unsupported', 'Web Serial is not supported.');
    }

    if (this.port) {
      return;
    }

    this.emit({ level: 'info', message: 'Requesting serial port.' });

    this.port = await this.serial.requestPort();
    await this.port.open({ baudRate: this.baudRate });

    if (!this.port.readable || !this.port.writable) {
      await this.disconnect();
      throw new DeviceClientError('serial_unavailable', 'Serial streams are unavailable.');
    }

    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    this.disposed = false;
    this.startReadLoop();

    this.emit({ level: 'info', message: 'Serial connection opened.' });
  }

  async disconnect() {
    this.disposed = true;

    this.rejectAllPending(new DeviceClientError('connection_closed', 'Connection closed.'));

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // Ignore reader cancellation issues during teardown.
      }
      this.reader.releaseLock();
      this.reader = null;
    }

    if (this.readLoopPromise) {
      try {
        await this.readLoopPromise;
      } catch {
        // Read loop errors are surfaced through pending requests + events.
      }
      this.readLoopPromise = null;
    }

    if (this.writer) {
      this.writer.releaseLock();
      this.writer = null;
    }

    if (this.port?.close) {
      try {
        await this.port.close();
      } catch {
        // Ignore close errors.
      }
    }

    this.port = null;
    this.inboundTextBuffer = '';
    this.emit({ level: 'info', message: 'Serial connection closed.' });
  }

  async handshake() {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.handshakeAttempts; attempt += 1) {
      this.emit({
        level: 'info',
        message: `Handshake attempt ${attempt}/${this.handshakeAttempts}.`,
      });

      try {
        const response = await this.sendRequest<HelloAckMessage>(
          'hello',
          {
            client: this.clientName,
            requestedProtocolVersion: DEVICE_PROTOCOL_VERSION,
          },
          ['hello_ack'],
          this.requestTimeoutMs,
        );

        if (!validateHelloAckPayload(response.payload)) {
          throw new DeviceClientError('invalid_hello_ack', 'hello_ack payload is malformed.');
        }

        this.emit({
          level: 'info',
          message: `Handshake complete with ${response.payload.device} (${response.payload.firmwareVersion}).`,
        });

        return response;
      } catch (error) {
        lastError = error as Error;
        this.emit({
          level: 'error',
          message: `Handshake attempt ${attempt} failed: ${lastError.message}`,
        });

        if (attempt < this.handshakeAttempts) {
          const backoffMs = this.backoffBaseMs * 2 ** (attempt - 1);
          await this.sleep(backoffMs);
        }
      }
    }

    throw lastError ?? new DeviceClientError('handshake_failed', 'Handshake failed.');
  }

  private startReadLoop() {
    if (!this.reader) {
      return;
    }

    this.readLoopPromise = (async () => {
      while (!this.disposed && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }

        if (!value || value.length === 0) {
          continue;
        }

        this.handleChunk(value);
      }
    })().catch((error: Error) => {
      this.emit({ level: 'error', message: `Read loop error: ${error.message}` });
      this.rejectAllPending(error);
    });
  }

  private handleChunk(chunk: Uint8Array) {
    this.inboundTextBuffer += this.decoder.decode(chunk, { stream: true });

    while (true) {
      const newlineIndex = this.inboundTextBuffer.indexOf('\n');
      if (newlineIndex < 0) {
        break;
      }

      let line = this.inboundTextBuffer.slice(0, newlineIndex);
      this.inboundTextBuffer = this.inboundTextBuffer.slice(newlineIndex + 1);

      if (line.endsWith('\r')) {
        line = line.slice(0, -1);
      }

      if (line.length === 0) {
        this.emit({ level: 'error', message: 'Received empty protocol frame.' });
        continue;
      }

      if (this.encoder.encode(line).length > DEVICE_PROTOCOL_MAX_FRAME_SIZE) {
        this.emit({ level: 'error', message: 'Received oversized protocol frame.' });
        continue;
      }

      this.handleLine(line);
    }

    if (this.encoder.encode(this.inboundTextBuffer).length > DEVICE_PROTOCOL_MAX_FRAME_SIZE) {
      this.emit({
        level: 'error',
        message: 'Incoming frame exceeded max size without newline terminator.',
      });
      this.inboundTextBuffer = '';
    }
  }

  private handleLine(line: string) {
    let decoded: unknown;

    try {
      decoded = JSON.parse(line) as unknown;
    } catch {
      this.emit({ level: 'error', message: 'Received non-JSON protocol frame.' });
      return;
    }

    const envelope = validateEnvelope(decoded);
    if (!envelope) {
      const pendingId = extractIdFromCandidate(decoded);
      if (pendingId) {
        this.rejectPending(
          pendingId,
          new DeviceClientError('invalid_envelope', 'Received malformed protocol envelope.'),
        );
      }
      this.emit({ level: 'error', message: 'Received malformed protocol envelope.' });
      return;
    }

    this.emit({ level: 'info', message: `Received frame: ${envelope.type} (${envelope.id}).` });

    const pendingRequest = this.pending.get(envelope.id);
    if (!pendingRequest) {
      this.emit({
        level: 'error',
        message: `Received uncorrelated frame id ${envelope.id}.`,
      });
      return;
    }

    if (envelope.type === 'error') {
      const payload = envelope.payload as DeviceErrorPayload;
      this.rejectPending(
        envelope.id,
        new DeviceClientError(
          payload.code || 'device_error',
          payload.message || 'Device returned error response.',
        ),
      );
      return;
    }

    if (!pendingRequest.expectedTypes.has(envelope.type)) {
      this.rejectPending(
        envelope.id,
        new DeviceClientError(
          'unexpected_response_type',
          `Expected ${Array.from(pendingRequest.expectedTypes).join(', ')}, received ${envelope.type}.`,
        ),
      );
      return;
    }

    clearTimeout(pendingRequest.timeoutId);
    this.pending.delete(envelope.id);
    pendingRequest.resolve(envelope);
  }

  private rejectAllPending(error: Error) {
    this.pending.forEach((entry) => {
      clearTimeout(entry.timeoutId);
      entry.reject(error);
    });
    this.pending.clear();
  }

  private rejectPending(id: string, error: Error) {
    const entry = this.pending.get(id);
    if (!entry) {
      return;
    }

    clearTimeout(entry.timeoutId);
    this.pending.delete(id);
    entry.reject(error);
  }

  private async sendFrame(frame: DeviceEnvelope) {
    if (!this.writer) {
      throw new DeviceClientError('not_connected', 'Serial writer is not available.');
    }

    const serialized = JSON.stringify(frame);
    const serializedBytes = this.encoder.encode(serialized);
    if (serializedBytes.length > DEVICE_PROTOCOL_MAX_FRAME_SIZE) {
      throw new DeviceClientError('frame_too_large', 'Outgoing frame exceeds max size.');
    }

    await this.writer.write(this.encoder.encode(`${serialized}\n`));
    this.emit({ level: 'info', message: `Sent frame: ${frame.type} (${frame.id}).` });
  }

  private async sendRequest<TResponse extends DeviceEnvelope>(
    type: DeviceMessageType,
    payload: EnvelopePayload,
    expectedResponseTypes: DeviceMessageType[],
    timeoutMs: number,
  ) {
    const id = createRequestId();

    const frame: DeviceEnvelope = {
      v: DEVICE_PROTOCOL_VERSION,
      type,
      id,
      ts: this.now(),
      payload,
    };

    const responsePromise = new Promise<TResponse>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new DeviceClientError('timeout', `Timed out waiting for response to ${type}.`));
      }, timeoutMs);

      this.pending.set(id, {
        expectedTypes: new Set(expectedResponseTypes),
        resolve: (message) => resolve(message as TResponse),
        reject,
        timeoutId,
      });
    });

    try {
      await this.sendFrame(frame);
    } catch (error) {
      this.rejectPending(id, error as Error);
      throw error;
    }

    return responsePromise;
  }
}
