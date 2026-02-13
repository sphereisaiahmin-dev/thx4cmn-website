export const DEVICE_PROTOCOL_VERSION = 1;
export const DEVICE_PROTOCOL_MAX_FRAME_SIZE = 1024;

export const CHORD_TYPES = ['maj', 'min', 'maj7', 'min7', 'maj9', 'min9', 'maj79', 'min79'] as const;
export type ChordType = (typeof CHORD_TYPES)[number];

export const MODIFIER_KEY_IDS = ['12', '13', '14', '15'] as const;
export type ModifierKeyId = (typeof MODIFIER_KEY_IDS)[number];

export type ModifierChordMap = Record<ModifierKeyId, ChordType>;

export const NOTE_PRESET_MODES = ['piano', 'gradient', 'rain'] as const;
export type NotePresetMode = (typeof NOTE_PRESET_MODES)[number];

export type HexColor = `#${string}`;
export const NOTE_PRESET_SPEED_MIN = 0.2;
export const NOTE_PRESET_SPEED_MAX = 3;

export interface PianoPreset extends EnvelopePayload {
  whiteKeyColor: HexColor;
  blackKeyColor: HexColor;
}

export interface GradientPreset extends EnvelopePayload {
  colorA: HexColor;
  colorB: HexColor;
  speed: number;
}

export interface RainPreset extends EnvelopePayload {
  colorA: HexColor;
  colorB: HexColor;
  speed: number;
}

export interface NotePreset extends EnvelopePayload {
  mode: NotePresetMode;
  piano: PianoPreset;
  gradient: GradientPreset;
  rain: RainPreset;
}

export interface DeviceState extends EnvelopePayload {
  notePreset: NotePreset;
  modifierChords: ModifierChordMap;
}

export const DEFAULT_DEVICE_STATE: DeviceState = {
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

export type DeviceConnectionState =
  | 'idle'
  | 'connecting'
  | 'handshaking'
  | 'ready'
  | 'error';

export type DeviceMessageType =
  | 'hello'
  | 'hello_ack'
  | 'get_state'
  | 'apply_config'
  | 'ping'
  | 'firmware_begin'
  | 'firmware_chunk'
  | 'firmware_file_complete'
  | 'firmware_commit'
  | 'firmware_abort'
  | 'error'
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
  state: DeviceState;
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
  config: DeviceState;
}

export interface ApplyConfigMessage extends DeviceEnvelope<'apply_config', ApplyConfigPayload> {}

export interface AckPayload extends EnvelopePayload {
  requestType: string;
  status: 'ok';
  state?: DeviceState;
  appliedConfigId?: string;
  pongTs?: number;
}

export interface AckMessage extends DeviceEnvelope<'ack', AckPayload> {}

export interface NackPayload extends EnvelopePayload {
  requestType: string;
  code: string;
  reason: string;
  retryable: boolean;
}

export interface NackMessage extends DeviceEnvelope<'nack', NackPayload> {}

export interface FirmwareFileDescriptor extends EnvelopePayload {
  path: string;
  size: number;
  sha256: string;
}

export interface FirmwareBeginPayload extends EnvelopePayload {
  sessionId: string;
  targetVersion: string;
  files: FirmwareFileDescriptor[];
}

export interface FirmwareChunkPayload extends EnvelopePayload {
  sessionId: string;
  path: string;
  chunkIndex: number;
  dataBase64: string;
}

export interface FirmwareFileCompletePayload extends EnvelopePayload {
  sessionId: string;
  path: string;
  size: number;
  sha256: string;
}

export interface FirmwareCommitPayload extends EnvelopePayload {
  sessionId: string;
  targetVersion: string;
}

export interface FirmwareAbortPayload extends EnvelopePayload {
  sessionId: string;
  reason?: string;
}

export interface DeviceFirmwarePackageFile {
  path: string;
  contentBase64: string;
  sha256: string;
}

export interface DeviceFirmwarePackage {
  version: string;
  files: DeviceFirmwarePackageFile[];
}

export interface DeviceFirmwareFlashProgress {
  type: 'begin' | 'chunk' | 'file_complete' | 'commit';
  filePath?: string;
  fileIndex?: number;
  totalFiles: number;
  chunkIndex?: number;
  totalChunks?: number;
}

export interface DeviceFirmwareFlashOptions {
  chunkSize?: number;
  onProgress?: (progress: DeviceFirmwareFlashProgress) => void;
}

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

export type SerialDisconnectEventLike = {
  port?: SerialPortLike;
};

export type SerialLike = {
  requestPort: () => Promise<SerialPortLike>;
  addEventListener?: (
    type: 'disconnect',
    listener: (event: SerialDisconnectEventLike | Event) => void,
  ) => void;
  removeEventListener?: (
    type: 'disconnect',
    listener: (event: SerialDisconnectEventLike | Event) => void,
  ) => void;
};

export interface DeviceSerialClientOptions {
  serial?: SerialLike | null;
  baudRate?: number;
  clientName?: string;
  requestTimeoutMs?: number;
  handshakeRequestTimeoutMs?: number;
  firmwareRequestTimeoutMs?: number;
  firmwareBeginAttempts?: number;
  handshakeAttempts?: number;
  backoffBaseMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onEvent?: ProtocolEventHandler;
  onDisconnect?: () => void;
}

const DEFAULT_BAUD_RATE = 115200;
const DEFAULT_REQUEST_TIMEOUT_MS = 3000;
const DEFAULT_HANDSHAKE_REQUEST_TIMEOUT_MS = 9000;
const DEFAULT_FIRMWARE_REQUEST_TIMEOUT_MS = 12000;
const DEFAULT_FIRMWARE_BEGIN_ATTEMPTS = 2;
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

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SHA256_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;
const MIN_PRESET_SPEED = NOTE_PRESET_SPEED_MIN;
const MAX_PRESET_SPEED = NOTE_PRESET_SPEED_MAX;
const DEFAULT_FIRMWARE_CHUNK_SIZE = 320;

const isHexColor = (value: unknown): value is HexColor =>
  typeof value === 'string' && HEX_COLOR_PATTERN.test(value);

const normalizeHexColor = (value: unknown, fallback: HexColor): HexColor => {
  if (!isHexColor(value)) {
    return fallback;
  }

  return value.toLowerCase() as HexColor;
};

const normalizePresetSpeed = (value: unknown, fallback: number) => {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }

  if (value < MIN_PRESET_SPEED) {
    return MIN_PRESET_SPEED;
  }

  if (value > MAX_PRESET_SPEED) {
    return MAX_PRESET_SPEED;
  }

  return value;
};

const isSha256Hex = (candidate: unknown): candidate is string =>
  typeof candidate === 'string' && SHA256_HEX_PATTERN.test(candidate);

const decodeBase64ToBytes = (value: string) => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }

  if (typeof atob !== 'function') {
    throw new DeviceClientError('base64_unsupported', 'No base64 decoder available.');
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const encodeBytesToBase64 = (bytes: Uint8Array) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  if (typeof btoa !== 'function') {
    throw new DeviceClientError('base64_unsupported', 'No base64 encoder available.');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const cloneDeviceState = (state: DeviceState): DeviceState => ({
  notePreset: {
    mode: state.notePreset.mode,
    piano: {
      whiteKeyColor: state.notePreset.piano.whiteKeyColor,
      blackKeyColor: state.notePreset.piano.blackKeyColor,
    },
    gradient: {
      colorA: state.notePreset.gradient.colorA,
      colorB: state.notePreset.gradient.colorB,
      speed: state.notePreset.gradient.speed,
    },
    rain: {
      colorA: state.notePreset.rain.colorA,
      colorB: state.notePreset.rain.colorB,
      speed: state.notePreset.rain.speed,
    },
  },
  modifierChords: {
    '12': state.modifierChords['12'],
    '13': state.modifierChords['13'],
    '14': state.modifierChords['14'],
    '15': state.modifierChords['15'],
  },
});

const isChordType = (value: unknown): value is ChordType =>
  typeof value === 'string' && CHORD_TYPES.includes(value as ChordType);

const isPresetMode = (value: unknown): value is NotePresetMode =>
  typeof value === 'string' && NOTE_PRESET_MODES.includes(value as NotePresetMode);

const validatePianoPreset = (candidate: unknown): candidate is PianoPreset =>
  isObject(candidate) &&
  isHexColor(candidate.whiteKeyColor) &&
  isHexColor(candidate.blackKeyColor);

const validateAnimatedPreset = (candidate: unknown): candidate is GradientPreset =>
  isObject(candidate) &&
  isHexColor(candidate.colorA) &&
  isHexColor(candidate.colorB) &&
  typeof candidate.speed === 'number' &&
  Number.isFinite(candidate.speed) &&
  candidate.speed >= MIN_PRESET_SPEED &&
  candidate.speed <= MAX_PRESET_SPEED;

const validateNotePreset = (candidate: unknown): candidate is NotePreset =>
  isObject(candidate) &&
  isPresetMode(candidate.mode) &&
  validatePianoPreset(candidate.piano) &&
  validateAnimatedPreset(candidate.gradient) &&
  validateAnimatedPreset(candidate.rain);

const sanitizeDeviceState = (candidate: DeviceState): DeviceState => ({
  notePreset: {
    mode: candidate.notePreset.mode,
    piano: {
      whiteKeyColor: normalizeHexColor(
        candidate.notePreset.piano.whiteKeyColor,
        DEFAULT_DEVICE_STATE.notePreset.piano.whiteKeyColor,
      ),
      blackKeyColor: normalizeHexColor(
        candidate.notePreset.piano.blackKeyColor,
        DEFAULT_DEVICE_STATE.notePreset.piano.blackKeyColor,
      ),
    },
    gradient: {
      colorA: normalizeHexColor(
        candidate.notePreset.gradient.colorA,
        DEFAULT_DEVICE_STATE.notePreset.gradient.colorA,
      ),
      colorB: normalizeHexColor(
        candidate.notePreset.gradient.colorB,
        DEFAULT_DEVICE_STATE.notePreset.gradient.colorB,
      ),
      speed: normalizePresetSpeed(
        candidate.notePreset.gradient.speed,
        DEFAULT_DEVICE_STATE.notePreset.gradient.speed,
      ),
    },
    rain: {
      colorA: normalizeHexColor(
        candidate.notePreset.rain.colorA,
        DEFAULT_DEVICE_STATE.notePreset.rain.colorA,
      ),
      colorB: normalizeHexColor(
        candidate.notePreset.rain.colorB,
        DEFAULT_DEVICE_STATE.notePreset.rain.colorB,
      ),
      speed: normalizePresetSpeed(
        candidate.notePreset.rain.speed,
        DEFAULT_DEVICE_STATE.notePreset.rain.speed,
      ),
    },
  },
  modifierChords: {
    '12': candidate.modifierChords['12'],
    '13': candidate.modifierChords['13'],
    '14': candidate.modifierChords['14'],
    '15': candidate.modifierChords['15'],
  },
});

const validateDeviceState = (candidate: unknown): candidate is DeviceState => {
  if (!isObject(candidate)) {
    return false;
  }

  if (!validateNotePreset(candidate.notePreset)) {
    return false;
  }

  if (!isObject(candidate.modifierChords)) {
    return false;
  }

  for (const key of MODIFIER_KEY_IDS) {
    if (!isChordType(candidate.modifierChords[key])) {
      return false;
    }
  }

  return true;
};

const tryNormalizeDeviceState = (candidate: unknown): DeviceState | null => {
  if (validateDeviceState(candidate)) {
    return sanitizeDeviceState(candidate);
  }

  if (isObject(candidate) && typeof candidate.showBlackKeys === 'boolean') {
    const migrated = cloneDeviceState(DEFAULT_DEVICE_STATE);
    migrated.notePreset.mode = 'piano';
    if (!candidate.showBlackKeys) {
      migrated.notePreset.piano.blackKeyColor = migrated.notePreset.piano.whiteKeyColor;
    }

    if (isObject(candidate.modifierChords)) {
      for (const key of MODIFIER_KEY_IDS) {
        const chordValue = candidate.modifierChords[key];
        if (isChordType(chordValue)) {
          migrated.modifierChords[key] = chordValue;
        }
      }
    }

    return migrated;
  }

  return null;
};

const normalizeDeviceState = (candidate: unknown): DeviceState =>
  tryNormalizeDeviceState(candidate) ?? cloneDeviceState(DEFAULT_DEVICE_STATE);

const isFirmwarePath = (candidate: unknown): candidate is string =>
  typeof candidate === 'string' && candidate.length > 0 && candidate.startsWith('/') && !candidate.includes('..');

const normalizeFirmwareChunkSize = (candidate: number | undefined) => {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    return DEFAULT_FIRMWARE_CHUNK_SIZE;
  }

  const rounded = Math.floor(candidate);
  if (rounded < 64) {
    return 64;
  }

  if (rounded > 900) {
    return 900;
  }

  return rounded;
};

const validateFirmwareFileDescriptor = (candidate: unknown): candidate is FirmwareFileDescriptor =>
  isObject(candidate) &&
  isFirmwarePath(candidate.path) &&
  typeof candidate.size === 'number' &&
  Number.isFinite(candidate.size) &&
  candidate.size >= 0 &&
  isSha256Hex(candidate.sha256);

const validateFirmwarePackage = (candidate: unknown): candidate is DeviceFirmwarePackage =>
  isObject(candidate) &&
  typeof candidate.version === 'string' &&
  Array.isArray(candidate.files) &&
  candidate.files.length > 0 &&
  candidate.files.every(
    (file) =>
      isObject(file) &&
      isFirmwarePath(file.path) &&
      typeof file.contentBase64 === 'string' &&
      file.contentBase64.length > 0 &&
      isSha256Hex(file.sha256),
  );

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

  return candidate as unknown as DeviceEnvelope;
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
    typeof payload.firmwareVersion === 'string' &&
    tryNormalizeDeviceState(payload.state) !== null
  );
};

const validateAckPayload = (payload: EnvelopePayload): payload is AckPayload =>
  typeof payload.requestType === 'string' && payload.status === 'ok';

const validateNackPayload = (payload: EnvelopePayload): payload is NackPayload =>
  typeof payload.requestType === 'string' &&
  typeof payload.code === 'string' &&
  typeof payload.reason === 'string' &&
  typeof payload.retryable === 'boolean';

class DeviceClientError extends Error {
  code: string;
  retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = 'DeviceClientError';
    this.code = code;
    this.retryable = retryable;
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
  private readonly handshakeRequestTimeoutMs: number;
  private readonly firmwareRequestTimeoutMs: number;
  private readonly firmwareBeginAttempts: number;
  private readonly handshakeAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onEvent?: ProtocolEventHandler;
  private readonly onDisconnect?: () => void;

  private port: SerialPortLike | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readLoopPromise: Promise<void> | null = null;
  private disposed = false;
  private inboundTextBuffer = '';
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  private readonly pending = new Map<string, PendingRequest>();
  private ignoredTextFrameCount = 0;
  private serialDisconnectListener: ((event: SerialDisconnectEventLike | Event) => void) | null =
    null;
  private disconnectNotified = false;

  constructor(options: DeviceSerialClientOptions = {}) {
    this.serial = options.serial ?? getDefaultSerial();
    this.baudRate = options.baudRate ?? DEFAULT_BAUD_RATE;
    this.clientName = options.clientName ?? 'thx4cmn-website';
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.handshakeRequestTimeoutMs =
      options.handshakeRequestTimeoutMs ?? DEFAULT_HANDSHAKE_REQUEST_TIMEOUT_MS;
    this.firmwareRequestTimeoutMs =
      options.firmwareRequestTimeoutMs ?? DEFAULT_FIRMWARE_REQUEST_TIMEOUT_MS;
    this.firmwareBeginAttempts = Math.max(
      1,
      Math.floor(options.firmwareBeginAttempts ?? DEFAULT_FIRMWARE_BEGIN_ATTEMPTS),
    );
    this.handshakeAttempts = options.handshakeAttempts ?? DEFAULT_HANDSHAKE_ATTEMPTS;
    this.backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? defaultSleep;
    this.onEvent = options.onEvent;
    this.onDisconnect = options.onDisconnect;
  }

  static isSupported() {
    return getDefaultSerial() !== null;
  }

  emit(event: Omit<ProtocolEvent, 'timestamp'>) {
    this.onEvent?.({ ...event, timestamp: this.now() });
  }

  get connected() {
    return this.port !== null && this.reader !== null && this.writer !== null;
  }

  async connect() {
    if (!this.serial) {
      throw new DeviceClientError('serial_unsupported', 'Web Serial is not supported.');
    }

    if (this.connected) {
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
    this.disconnectNotified = false;
    this.ignoredTextFrameCount = 0;
    this.registerSerialDisconnectListener();
    this.startReadLoop();

    this.emit({ level: 'info', message: 'Serial connection opened.' });
  }

  async disconnect() {
    this.disposed = true;

    this.unregisterSerialDisconnectListener();
    this.rejectAllPending(new DeviceClientError('connection_closed', 'Connection closed.', true));

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
    this.disconnectNotified = false;
    this.ignoredTextFrameCount = 0;
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
          this.handshakeRequestTimeoutMs,
        );

        if (!validateHelloAckPayload(response.payload)) {
          throw new DeviceClientError('invalid_hello_ack', 'hello_ack payload is malformed.');
        }

        const normalizedState = tryNormalizeDeviceState(response.payload.state);
        if (!normalizedState) {
          throw new DeviceClientError('invalid_hello_ack', 'hello_ack payload.state is invalid.');
        }

        response.payload.state = normalizedState;

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

  async getState() {
    const response = await this.sendRequest<AckMessage>(
      'get_state',
      {},
      ['ack'],
      this.requestTimeoutMs,
    );

    const payload = this.expectAck(response, 'get_state');
    const normalizedState = tryNormalizeDeviceState(payload.state);
    if (!normalizedState) {
      throw new DeviceClientError('invalid_state', 'get_state ack payload.state is invalid.');
    }

    return cloneDeviceState(normalizedState);
  }

  async applyConfig(
    config: DeviceState,
    options: {
      configId?: string;
      idempotencyKey?: string;
    } = {},
  ) {
    if (!validateDeviceState(config)) {
      throw new DeviceClientError('invalid_config', 'Configuration payload is invalid.');
    }

    const response = await this.sendRequest<AckMessage>(
      'apply_config',
      {
        configId: options.configId ?? createRequestId(),
        idempotencyKey: options.idempotencyKey ?? createRequestId(),
        config: cloneDeviceState(config),
      },
      ['ack'],
      this.requestTimeoutMs,
    );

    const payload = this.expectAck(response, 'apply_config');
    const normalizedState = tryNormalizeDeviceState(payload.state);
    if (!normalizedState) {
      throw new DeviceClientError('invalid_state', 'apply_config ack payload.state is invalid.');
    }

    return {
      state: cloneDeviceState(normalizedState),
      appliedConfigId:
        typeof payload.appliedConfigId === 'string' ? payload.appliedConfigId : undefined,
    };
  }

  async ping() {
    const response = await this.sendRequest<AckMessage>('ping', {}, ['ack'], this.requestTimeoutMs);
    const payload = this.expectAck(response, 'ping');
    return {
      pongTs: typeof payload.pongTs === 'number' ? payload.pongTs : undefined,
    };
  }

  async firmwareBegin(payload: FirmwareBeginPayload) {
    if (
      typeof payload.sessionId !== 'string' ||
      payload.sessionId.length === 0 ||
      typeof payload.targetVersion !== 'string' ||
      payload.targetVersion.length === 0 ||
      !Array.isArray(payload.files) ||
      payload.files.length === 0 ||
      !payload.files.every(validateFirmwareFileDescriptor)
    ) {
      throw new DeviceClientError('invalid_firmware_begin', 'Firmware begin payload is invalid.');
    }

    const response = await this.sendRequest<AckMessage>(
      'firmware_begin',
      {
        sessionId: payload.sessionId,
        targetVersion: payload.targetVersion,
        files: payload.files,
      },
      ['ack'],
      this.firmwareRequestTimeoutMs,
    );
    this.expectAck(response, 'firmware_begin');
  }

  async firmwareChunk(payload: FirmwareChunkPayload) {
    if (
      typeof payload.sessionId !== 'string' ||
      payload.sessionId.length === 0 ||
      !isFirmwarePath(payload.path) ||
      typeof payload.chunkIndex !== 'number' ||
      !Number.isInteger(payload.chunkIndex) ||
      payload.chunkIndex < 0 ||
      typeof payload.dataBase64 !== 'string' ||
      payload.dataBase64.length === 0
    ) {
      throw new DeviceClientError('invalid_firmware_chunk', 'Firmware chunk payload is invalid.');
    }

    const response = await this.sendRequest<AckMessage>(
      'firmware_chunk',
      {
        sessionId: payload.sessionId,
        path: payload.path,
        chunkIndex: payload.chunkIndex,
        dataBase64: payload.dataBase64,
      },
      ['ack'],
      this.firmwareRequestTimeoutMs,
    );
    this.expectAck(response, 'firmware_chunk');
  }

  async firmwareFileComplete(payload: FirmwareFileCompletePayload) {
    if (
      typeof payload.sessionId !== 'string' ||
      payload.sessionId.length === 0 ||
      !isFirmwarePath(payload.path) ||
      typeof payload.size !== 'number' ||
      !Number.isFinite(payload.size) ||
      payload.size < 0 ||
      !isSha256Hex(payload.sha256)
    ) {
      throw new DeviceClientError(
        'invalid_firmware_file_complete',
        'Firmware file completion payload is invalid.',
      );
    }

    const response = await this.sendRequest<AckMessage>(
      'firmware_file_complete',
      {
        sessionId: payload.sessionId,
        path: payload.path,
        size: payload.size,
        sha256: payload.sha256,
      },
      ['ack'],
      this.firmwareRequestTimeoutMs,
    );
    this.expectAck(response, 'firmware_file_complete');
  }

  async firmwareCommit(payload: FirmwareCommitPayload) {
    if (
      typeof payload.sessionId !== 'string' ||
      payload.sessionId.length === 0 ||
      typeof payload.targetVersion !== 'string' ||
      payload.targetVersion.length === 0
    ) {
      throw new DeviceClientError('invalid_firmware_commit', 'Firmware commit payload is invalid.');
    }

    const response = await this.sendRequest<AckMessage>(
      'firmware_commit',
      {
        sessionId: payload.sessionId,
        targetVersion: payload.targetVersion,
      },
      ['ack'],
      this.firmwareRequestTimeoutMs,
    );
    this.expectAck(response, 'firmware_commit');
  }

  async firmwareAbort(payload: FirmwareAbortPayload) {
    if (typeof payload.sessionId !== 'string' || payload.sessionId.length === 0) {
      throw new DeviceClientError('invalid_firmware_abort', 'Firmware abort payload is invalid.');
    }

    const response = await this.sendRequest<AckMessage>(
      'firmware_abort',
      {
        sessionId: payload.sessionId,
        reason: typeof payload.reason === 'string' ? payload.reason : undefined,
      },
      ['ack'],
      this.firmwareRequestTimeoutMs,
    );
    this.expectAck(response, 'firmware_abort');
  }

  async flashFirmwarePackage(
    pkg: DeviceFirmwarePackage,
    options: DeviceFirmwareFlashOptions = {},
  ) {
    if (!validateFirmwarePackage(pkg)) {
      throw new DeviceClientError('invalid_firmware_package', 'Firmware package is invalid.');
    }

    const sessionId = createRequestId();
    const chunkSize = normalizeFirmwareChunkSize(options.chunkSize);
    const materializedFiles = pkg.files.map((file) => {
      const bytes = decodeBase64ToBytes(file.contentBase64);
      return {
        path: file.path,
        bytes,
        size: bytes.byteLength,
        sha256: file.sha256.toLowerCase(),
      };
    });

    try {
      options.onProgress?.({
        type: 'begin',
        totalFiles: materializedFiles.length,
      });

      const firmwareBeginPayload: FirmwareBeginPayload = {
        sessionId,
        targetVersion: pkg.version,
        files: materializedFiles.map((file) => ({
          path: file.path,
          size: file.size,
          sha256: file.sha256,
        })),
      };

      let firmwareBeginCompleted = false;
      let firmwareBeginError: unknown;
      for (let attempt = 1; attempt <= this.firmwareBeginAttempts; attempt += 1) {
        try {
          await this.firmwareBegin(firmwareBeginPayload);
          firmwareBeginCompleted = true;
          break;
        } catch (error) {
          firmwareBeginError = error;
          const isTimeoutError =
            error instanceof DeviceClientError &&
            error.code === 'timeout' &&
            attempt < this.firmwareBeginAttempts;
          if (!isTimeoutError) {
            throw error;
          }

          this.emit({
            level: 'error',
            message: `firmware_begin timed out on attempt ${attempt}/${this.firmwareBeginAttempts}; retrying.`,
          });
          await this.sleep(this.backoffBaseMs * attempt);
        }
      }

      if (!firmwareBeginCompleted) {
        throw (firmwareBeginError as Error);
      }

      for (let fileIndex = 0; fileIndex < materializedFiles.length; fileIndex += 1) {
        const file = materializedFiles[fileIndex];
        const totalChunks = Math.max(1, Math.ceil(file.bytes.byteLength / chunkSize));

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
          const start = chunkIndex * chunkSize;
          const end = Math.min(start + chunkSize, file.bytes.byteLength);
          const chunk = file.bytes.slice(start, end);
          await this.firmwareChunk({
            sessionId,
            path: file.path,
            chunkIndex,
            dataBase64: encodeBytesToBase64(chunk),
          });

          options.onProgress?.({
            type: 'chunk',
            filePath: file.path,
            fileIndex,
            totalFiles: materializedFiles.length,
            chunkIndex,
            totalChunks,
          });
        }

        await this.firmwareFileComplete({
          sessionId,
          path: file.path,
          size: file.size,
          sha256: file.sha256,
        });

        options.onProgress?.({
          type: 'file_complete',
          filePath: file.path,
          fileIndex,
          totalFiles: materializedFiles.length,
        });
      }

      await this.firmwareCommit({
        sessionId,
        targetVersion: pkg.version,
      });

      options.onProgress?.({
        type: 'commit',
        totalFiles: materializedFiles.length,
      });
    } catch (error) {
      try {
        await this.firmwareAbort({
          sessionId,
          reason: 'Host-side transfer failed.',
        });
      } catch {
        // Ignore abort failures after transfer errors.
      }
      throw error;
    }
  }

  private expectAck(response: DeviceEnvelope, requestType: string): AckPayload {
    if (response.type !== 'ack') {
      throw new DeviceClientError(
        'unexpected_response_type',
        `Expected ack for ${requestType}, received ${response.type}.`,
      );
    }

    if (!validateAckPayload(response.payload)) {
      throw new DeviceClientError('invalid_ack', `ack payload for ${requestType} is malformed.`);
    }

    if (response.payload.requestType !== requestType) {
      throw new DeviceClientError(
        'unexpected_ack_request_type',
        `Expected ack.requestType ${requestType}, received ${response.payload.requestType}.`,
      );
    }

    return response.payload;
  }

  private registerSerialDisconnectListener() {
    if (!this.serial || typeof this.serial.addEventListener !== 'function') {
      return;
    }

    this.serialDisconnectListener = (event: SerialDisconnectEventLike | Event) => {
      if (this.disposed || !this.port) {
        return;
      }

      const disconnectEvent = event as SerialDisconnectEventLike;
      if (disconnectEvent.port && disconnectEvent.port !== this.port) {
        return;
      }

      this.handleUnexpectedDisconnect('Serial device disconnected.');
    };

    this.serial.addEventListener('disconnect', this.serialDisconnectListener);
  }

  private unregisterSerialDisconnectListener() {
    if (
      !this.serial ||
      typeof this.serial.removeEventListener !== 'function' ||
      !this.serialDisconnectListener
    ) {
      return;
    }

    this.serial.removeEventListener('disconnect', this.serialDisconnectListener);
    this.serialDisconnectListener = null;
  }

  private handleUnexpectedDisconnect(message: string) {
    if (this.disconnectNotified) {
      return;
    }

    this.disconnectNotified = true;
    this.emit({ level: 'error', message });
    this.rejectAllPending(new DeviceClientError('connection_closed', message, true));
    this.onDisconnect?.();
  }

  private startReadLoop() {
    if (!this.reader) {
      return;
    }

    this.readLoopPromise = (async () => {
      while (!this.disposed && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) {
          if (!this.disposed) {
            this.handleUnexpectedDisconnect('Serial reader closed unexpectedly.');
          }
          break;
        }

        if (!value || value.length === 0) {
          continue;
        }

        this.handleChunk(value);
      }
    })().catch((error: Error) => {
      this.emit({ level: 'error', message: `Read loop error: ${error.message}` });
      this.handleUnexpectedDisconnect('Serial read loop failed.');
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
    const trimmedLine = line.trimStart();

    try {
      decoded = JSON.parse(line) as unknown;
    } catch {
      if (!trimmedLine.startsWith('{')) {
        this.ignoredTextFrameCount += 1;
        if (this.ignoredTextFrameCount <= 3 || this.ignoredTextFrameCount % 10 === 0) {
          this.emit({
            level: 'info',
            message: 'Ignoring non-protocol text from serial channel.',
          });
        }
        return;
      }

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
      if (envelope.type === 'hello_ack') {
        const fallback = this.findSinglePendingByExpectedType('hello_ack');
        if (fallback) {
          clearTimeout(fallback.entry.timeoutId);
          this.pending.delete(fallback.id);
          this.emit({
            level: 'info',
            message: `Recovered hello_ack correlation mismatch (frame id ${envelope.id}, pending id ${fallback.id}).`,
          });
          fallback.entry.resolve(envelope);
          return;
        }
      }

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

    if (envelope.type === 'nack') {
      const payload = envelope.payload;
      if (!validateNackPayload(payload)) {
        this.rejectPending(
          envelope.id,
          new DeviceClientError('invalid_nack', 'Device returned malformed nack response.'),
        );
        return;
      }

      this.rejectPending(
        envelope.id,
        new DeviceClientError(payload.code, payload.reason, payload.retryable),
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

  private findSinglePendingByExpectedType(type: DeviceMessageType) {
    let match: { id: string; entry: PendingRequest } | null = null;

    for (const [id, entry] of this.pending.entries()) {
      if (!entry.expectedTypes.has(type)) {
        continue;
      }

      if (match) {
        return null;
      }

      match = { id, entry };
    }

    return match;
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
        reject(new DeviceClientError('timeout', `Timed out waiting for response to ${type}.`, true));
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

export const isValidDeviceState = validateDeviceState;
export const normalizeIncomingDeviceState = normalizeDeviceState;
