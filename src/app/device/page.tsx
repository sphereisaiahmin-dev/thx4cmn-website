'use client';

import { HexColorPicker } from 'react-colorful';
import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CHORD_TYPES,
  DEFAULT_DEVICE_STATE,
  DeviceFirmwarePackage,
  MODIFIER_KEY_IDS,
  NOTE_PRESET_MODES,
  NOTE_PRESET_SPEED_MAX,
  NOTE_PRESET_SPEED_MIN,
  DeviceConnectionState,
  DeviceSerialClient,
  DeviceState,
  ModifierKeyId,
  NotePresetMode,
} from '@/lib/deviceSerialClient';

type SessionLogEntry = {
  message: string;
  timestamp: number;
};

type FirmwareUpdateStrategy = 'none' | 'direct_flash';

type FirmwareUpdateState = {
  updateAvailable: boolean;
  strategy: FirmwareUpdateStrategy;
  currentVersion: string;
  currentReleaseRank: number;
  latestVersion: string;
  latestReleaseRank: number;
  targetVersion?: string;
  targetReleaseRank?: number;
  packageKey?: string;
  downloadUrl?: string;
  sha256?: string;
  notes?: string;
};

const MAX_LOG_ENTRIES = 80;
const KEEPALIVE_INTERVAL_MS = 4500;
const KEEPALIVE_FAILURE_THRESHOLD = 2;
const LEGACY_REPL_PROMPT = '>>>';
const LEGACY_REPL_BOOT_TIMEOUT_MS = 7000;
const LEGACY_REPL_COMMAND_TIMEOUT_MS = 9000;
const LEGACY_REPL_CHUNK_BASE64_SIZE = 96;

type BrowserSerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>;
  close?: () => Promise<void>;
  readable?: ReadableStream<Uint8Array> | null;
  writable?: WritableStream<Uint8Array> | null;
};

type BrowserSerialLike = {
  getPorts?: () => Promise<BrowserSerialPortLike[]>;
  requestPort: () => Promise<BrowserSerialPortLike>;
};

const sleepMs = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const splitBySize = (value: string, size: number) => {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
};

const isFirmwareBeginTimeoutMessage = (message: string) =>
  message.includes('Timed out waiting for response to firmware_begin');

const flashFirmwareViaLegacyRepl = async (
  pkg: DeviceFirmwarePackage,
  appendLog: (message: string) => void,
) => {
  const serial = (navigator as Navigator & { serial?: BrowserSerialLike }).serial;
  if (!serial) {
    throw new Error('Web Serial is not supported in this browser.');
  }

  let port: BrowserSerialPortLike | null = null;
  if (typeof serial.getPorts === 'function') {
    const existingPorts = await serial.getPorts();
    if (existingPorts.length > 0) {
      port = existingPorts[0];
    }
  }

  if (!port) {
    appendLog('Select thx-c in the browser prompt to run legacy recovery update.');
    port = await serial.requestPort();
  }

  await port.open({ baudRate: 115200 });

  if (!port.readable || !port.writable) {
    throw new Error('Serial streams are unavailable for legacy recovery update.');
  }

  const reader = port.readable.getReader();
  const writer = port.writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let serialText = '';
  let promptCursor = 0;

  const readerTask = (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (!value || value.length === 0) {
          continue;
        }

        serialText += decoder.decode(value, { stream: true });
        if (serialText.length > 16384) {
          const trimAmount = serialText.length - 8192;
          serialText = serialText.slice(trimAmount);
          promptCursor = Math.max(0, promptCursor - trimAmount);
        }
      }
    } catch {
      // Ignore cancellation or transport errors during cleanup.
    }
  })();

  const waitForPrompt = async (timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const foundIndex = serialText.indexOf(LEGACY_REPL_PROMPT, promptCursor);
      if (foundIndex >= 0) {
        promptCursor = foundIndex + LEGACY_REPL_PROMPT.length;
        return;
      }

      await sleepMs(20);
    }

    const serialTail = serialText.slice(-240).replace(/\s+/g, ' ').trim();
    throw new Error(`Legacy REPL prompt timeout (${serialTail || 'no serial output'}).`);
  };

  const sendRaw = async (text: string) => {
    await writer.write(encoder.encode(text));
  };

  const sendCommand = async (command: string) => {
    await sendRaw(`${command}\r\n`);
    await waitForPrompt(LEGACY_REPL_COMMAND_TIMEOUT_MS);
  };

  const totalChunks = pkg.files.reduce(
    (count, file) => count + Math.max(1, Math.ceil(file.contentBase64.length / LEGACY_REPL_CHUNK_BASE64_SIZE)),
    0,
  );

  let transferredChunks = 0;

  try {
    await sendRaw('\x03\x03\r\n');
    await waitForPrompt(LEGACY_REPL_BOOT_TIMEOUT_MS);
    await sendCommand('import binascii');

    for (const file of pkg.files) {
      appendLog(`Legacy recovery writing ${file.path}...`);
      await sendCommand(`f=open(${JSON.stringify(file.path)},'wb')`);

      for (const chunk of splitBySize(file.contentBase64, LEGACY_REPL_CHUNK_BASE64_SIZE)) {
        await sendCommand(`_=f.write(binascii.a2b_base64(${JSON.stringify(chunk)}))`);
        transferredChunks += 1;
        if (transferredChunks % 80 === 0 || transferredChunks === totalChunks) {
          appendLog(`Legacy recovery transfer ${transferredChunks}/${totalChunks} chunks...`);
        }
      }

      await sendCommand('f.close()');
    }

    await sendCommand('import microcontroller');
    await sendRaw('microcontroller.reset()\r\n');
    await sleepMs(500);
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore reader cancellation errors.
    }
    try {
      await readerTask;
    } catch {
      // Ignore reader task shutdown errors.
    }
    reader.releaseLock();
    writer.releaseLock();
    try {
      await port.close?.();
    } catch {
      // Ignore close errors during teardown.
    }
  }
};

// Keep UI key positions aligned with firmware PIM551 _ROTATED mapping.
const PIM551_ROTATED_MAP: Record<number, number> = {
  0: 12,
  1: 8,
  2: 4,
  3: 0,
  4: 13,
  5: 9,
  6: 5,
  7: 1,
  8: 14,
  9: 10,
  10: 6,
  11: 2,
  12: 15,
  13: 11,
  14: 7,
  15: 3,
};

const buildKeypadLayout = () => {
  const physicalToLogical = new Array<number>(16).fill(0);
  for (const [logicalKeyText, physicalKey] of Object.entries(PIM551_ROTATED_MAP)) {
    physicalToLogical[physicalKey] = Number(logicalKeyText);
  }

  return [
    physicalToLogical.slice(0, 4),
    physicalToLogical.slice(4, 8),
    physicalToLogical.slice(8, 12),
    physicalToLogical.slice(12, 16),
  ];
};

const KEYPAD_LAYOUT: number[][] = buildKeypadLayout();

const BLACK_NOTE_KEY_INDICES = new Set([1, 3, 6, 8, 10]);
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const COLOR_PICKER_WIDTH_PX = 200;
const PRESET_MODE_LABELS: Record<NotePresetMode, string> = {
  piano: 'Piano',
  gradient: 'Rain',
  rain: 'Gradient',
};

const formatLogTimestamp = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const normalizeHexColor = (value: string, fallback: string) => {
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return fallback;
  }

  return trimmed.toLowerCase();
};

const clampPresetSpeed = (value: number) =>
  Math.max(NOTE_PRESET_SPEED_MIN, Math.min(NOTE_PRESET_SPEED_MAX, value));
const normalizePresetSpeedProgress = (speed: number) =>
  (clampPresetSpeed(speed) - NOTE_PRESET_SPEED_MIN) /
  (NOTE_PRESET_SPEED_MAX - NOTE_PRESET_SPEED_MIN);

const cloneState = (state: DeviceState): DeviceState => ({
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

const statesEqual = (a: DeviceState, b: DeviceState) =>
  a.notePreset.mode === b.notePreset.mode &&
  a.notePreset.piano.whiteKeyColor === b.notePreset.piano.whiteKeyColor &&
  a.notePreset.piano.blackKeyColor === b.notePreset.piano.blackKeyColor &&
  a.notePreset.gradient.colorA === b.notePreset.gradient.colorA &&
  a.notePreset.gradient.colorB === b.notePreset.gradient.colorB &&
  a.notePreset.gradient.speed === b.notePreset.gradient.speed &&
  a.notePreset.rain.colorA === b.notePreset.rain.colorA &&
  a.notePreset.rain.colorB === b.notePreset.rain.colorB &&
  a.notePreset.rain.speed === b.notePreset.rain.speed &&
  MODIFIER_KEY_IDS.every((keyId) => a.modifierChords[keyId] === b.modifierChords[keyId]);

const parseHexColor = (hex: string) => ({
  r: Number.parseInt(hex.slice(1, 3), 16),
  g: Number.parseInt(hex.slice(3, 5), 16),
  b: Number.parseInt(hex.slice(5, 7), 16),
});

const lerpChannel = (start: number, end: number, amount: number) =>
  Math.round(start + (end - start) * amount);

const lerpHex = (aHex: string, bHex: string, amount: number) => {
  const a = parseHexColor(aHex);
  const b = parseHexColor(bHex);
  const clamped = Math.max(0, Math.min(1, amount));

  const r = lerpChannel(a.r, b.r, clamped);
  const g = lerpChannel(a.g, b.g, clamped);
  const bChannel = lerpChannel(a.b, b.b, clamped);

  return `rgb(${r}, ${g}, ${bChannel})`;
};

const isColorDark = (hex: string) => {
  const { r, g, b } = parseHexColor(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
};

const getNotePreviewColor = (state: DeviceState, keyIndex: number, previewTick: number) => {
  const mode = state.notePreset.mode;
  if (mode === 'piano') {
    if (BLACK_NOTE_KEY_INDICES.has(keyIndex)) {
      return state.notePreset.piano.blackKeyColor;
    }
    return state.notePreset.piano.whiteKeyColor;
  }

  if (mode === 'gradient') {
    const span = 11;
    const base = keyIndex / span;
    const offset = (previewTick * state.notePreset.gradient.speed * 0.25) % 1;
    const blend = (base + offset) % 1;
    return lerpHex(state.notePreset.gradient.colorA, state.notePreset.gradient.colorB, blend);
  }

  const phase = previewTick * state.notePreset.rain.speed + keyIndex * 0.9;
  const blend = 0.5 + 0.5 * Math.sin(phase * 0.7 + Math.sin(phase * 0.21));
  return lerpHex(state.notePreset.rain.colorA, state.notePreset.rain.colorB, blend);
};

type ColorPaletteFieldProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
};

function ColorPaletteField({ label, value, onChange }: ColorPaletteFieldProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const textColorClass = isColorDark(value) ? 'text-white' : 'text-black';

  return (
    <div
      className="space-y-2 rounded-xl border border-black/15 bg-white/70 p-3"
      style={{ width: `${COLOR_PICKER_WIDTH_PX}px` }}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-black/70">{label}</p>
        <span
          className={`inline-flex h-8 min-w-[96px] items-center justify-center rounded-md border border-black/20 px-2 text-xs uppercase tracking-[0.16em] ${textColorClass}`}
          style={{ backgroundColor: value }}
        >
          {value}
        </span>
      </button>

      {isExpanded && (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border border-black/20">
            <HexColorPicker
              color={value}
              onChange={(next) => onChange(normalizeHexColor(next, value))}
              style={{ width: `${COLOR_PICKER_WIDTH_PX}px` }}
            />
          </div>
          <input
            type="text"
            value={value}
            onChange={(event) => onChange(normalizeHexColor(event.target.value, value))}
            className="w-full rounded-md border border-black/25 bg-white px-2 py-1 text-sm uppercase tracking-[0.08em]"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}

type AnimatedPresetSection = 'gradient' | 'rain';

const getAnimatedPresetSection = (mode: NotePresetMode): AnimatedPresetSection | null => {
  if (mode === 'gradient' || mode === 'rain') {
    return mode;
  }

  return null;
};

const getPresetColorFieldLabel = (
  section: AnimatedPresetSection,
  field: 'colorA' | 'colorB',
) => `${PRESET_MODE_LABELS[section]} color ${field === 'colorA' ? 'A' : 'B'}`;

const getPresetSpeedLabel = (section: AnimatedPresetSection) => `${PRESET_MODE_LABELS[section]} speed`;

const isFirmwarePackage = (candidate: unknown): candidate is DeviceFirmwarePackage => {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }

  const packageCandidate = candidate as DeviceFirmwarePackage;
  return (
    typeof packageCandidate.version === 'string' &&
    Array.isArray(packageCandidate.files) &&
    packageCandidate.files.length > 0 &&
    packageCandidate.files.every(
      (entry) =>
        typeof entry.path === 'string' &&
        typeof entry.contentBase64 === 'string' &&
        typeof entry.sha256 === 'string',
    )
  );
};

export default function DevicePage() {
  const [status, setStatus] = useState<DeviceConnectionState>('idle');
  const [log, setLog] = useState<SessionLogEntry[]>([]);
  const [deviceState, setDeviceState] = useState<DeviceState>(cloneState(DEFAULT_DEVICE_STATE));
  const [draftState, setDraftState] = useState<DeviceState>(cloneState(DEFAULT_DEVICE_STATE));
  const [selectedModifierKey, setSelectedModifierKey] = useState<ModifierKeyId | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [previewTick, setPreviewTick] = useState(0);
  const [connectedFirmwareVersion, setConnectedFirmwareVersion] = useState<string | null>(null);
  const [connectedFeatures, setConnectedFeatures] = useState<string[]>([]);
  const [firmwareUpdateState, setFirmwareUpdateState] = useState<FirmwareUpdateState | null>(null);
  const [isCheckingFirmware, setIsCheckingFirmware] = useState(false);
  const [isUpdatingFirmware, setIsUpdatingFirmware] = useState(false);
  const [isUpdatePanelOpen, setIsUpdatePanelOpen] = useState(false);

  const clientRef = useRef<DeviceSerialClient | null>(null);
  const statusRef = useRef<DeviceConnectionState>('idle');
  const keepaliveTimerRef = useRef<number | null>(null);
  const keepaliveFailuresRef = useRef(0);
  const hasLoggedConnectionLostRef = useRef(false);

  const appendLog = useCallback((message: string) => {
    setLog((prev) => [{ message, timestamp: Date.now() }, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, []);

  const logConnectionLost = useCallback(() => {
    if (hasLoggedConnectionLostRef.current) {
      return;
    }

    hasLoggedConnectionLostRef.current = true;
    appendLog('Connection lost. Reconnect your device.');
  }, [appendLog]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPreviewTick((prev) => prev + 0.08);
    }, 60);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const stopKeepalive = useCallback(() => {
    if (keepaliveTimerRef.current !== null) {
      window.clearInterval(keepaliveTimerRef.current);
      keepaliveTimerRef.current = null;
    }
    keepaliveFailuresRef.current = 0;
  }, []);

  const disconnectClient = useCallback(async () => {
    stopKeepalive();

    if (!clientRef.current) {
      return;
    }

    const client = clientRef.current;
    clientRef.current = null;
    await client.disconnect();
  }, [stopKeepalive]);

  const hydrateState = useCallback((incoming: DeviceState) => {
    const next = cloneState(incoming);
    setDeviceState(next);
    setDraftState(next);
  }, []);

  const refreshFirmwareUpdateState = useCallback(
    async (firmwareVersion: string, options: { silent?: boolean } = {}) => {
      setIsCheckingFirmware(true);

      try {
        const response = await fetch(
          `/api/device/firmware/latest?currentVersion=${encodeURIComponent(firmwareVersion)}&device=${encodeURIComponent('thx-c')}`,
          {
            method: 'GET',
            cache: 'no-store',
          },
        );

        if (!response.ok) {
          throw new Error(`Firmware update lookup failed (${response.status}).`);
        }

        const payload = (await response.json()) as FirmwareUpdateState;
        if (typeof payload.updateAvailable !== 'boolean' || typeof payload.strategy !== 'string') {
          throw new Error('Firmware update response was malformed.');
        }

        setFirmwareUpdateState(payload);
        if (!options.silent) {
          if (payload.updateAvailable) {
            appendLog(
              `Firmware ${payload.currentVersion} can update to ${payload.targetVersion ?? payload.latestVersion}.`,
            );
          } else {
            appendLog(`Firmware ${payload.currentVersion} is up to date.`);
          }
        }

        return payload;
      } catch (error) {
        console.error(error);
        setFirmwareUpdateState(null);
        if (!options.silent) {
          appendLog('Unable to check firmware updates right now.');
        }
        return null;
      } finally {
        setIsCheckingFirmware(false);
      }
    },
    [appendLog],
  );

  const startKeepalive = useCallback(() => {
    stopKeepalive();

    keepaliveTimerRef.current = window.setInterval(async () => {
      const client = clientRef.current;
      if (!client || statusRef.current !== 'ready') {
        return;
      }

      try {
        await client.ping();
        keepaliveFailuresRef.current = 0;
      } catch {
        keepaliveFailuresRef.current += 1;

        if (keepaliveFailuresRef.current >= KEEPALIVE_FAILURE_THRESHOLD) {
          stopKeepalive();
          setStatus('error');
          logConnectionLost();
          await disconnectClient();
        }
      }
    }, KEEPALIVE_INTERVAL_MS);
  }, [disconnectClient, logConnectionLost, stopKeepalive]);

  const handleConnect = useCallback(async () => {
    if (status === 'connecting' || status === 'handshaking') {
      return;
    }

    if (!DeviceSerialClient.isSupported()) {
      setStatus('error');
      appendLog('Web Serial is not supported in this browser.');
      return;
    }

    await disconnectClient();

    const client = new DeviceSerialClient({
      onDisconnect: () => {
        stopKeepalive();
        setStatus('error');
        logConnectionLost();
      },
    });

    clientRef.current = client;
    setStatus('connecting');
    hasLoggedConnectionLostRef.current = false;
    appendLog('Connecting to thx-c...');

    try {
      await client.connect();
      setStatus('handshaking');

      const helloResponse = await client.handshake();
      setConnectedFirmwareVersion(helloResponse.payload.firmwareVersion);
      setConnectedFeatures(helloResponse.payload.features);
      await refreshFirmwareUpdateState(helloResponse.payload.firmwareVersion);
      hydrateState(helloResponse.payload.state);

      const stateResponse = await client.getState();
      hydrateState(stateResponse);

      setStatus('ready');
      startKeepalive();
      appendLog('Connected to thx-c. Settings synced.');
    } catch (error) {
      console.error(error);
      setStatus('error');
      logConnectionLost();
      setConnectedFirmwareVersion(null);
      setConnectedFeatures([]);
      setFirmwareUpdateState(null);
      setIsUpdatePanelOpen(false);

      await disconnectClient();
    }
  }, [
    appendLog,
    refreshFirmwareUpdateState,
    disconnectClient,
    hydrateState,
    logConnectionLost,
    startKeepalive,
    status,
    stopKeepalive,
  ]);

  const handleDisconnect = useCallback(async () => {
    await disconnectClient();
    setStatus('idle');
    hasLoggedConnectionLostRef.current = false;
    setConnectedFirmwareVersion(null);
    setConnectedFeatures([]);
    setFirmwareUpdateState(null);
    setIsUpdatePanelOpen(false);
    appendLog('Disconnected from thx-c.');
  }, [appendLog, disconnectClient]);

  const handleApplyConfig = useCallback(async () => {
    if (!clientRef.current || status !== 'ready' || isApplying || isUpdatingFirmware) {
      return;
    }

    setIsApplying(true);

    try {
      const response = await clientRef.current.applyConfig(draftState, {
        configId: `cfg-${Date.now()}`,
        idempotencyKey: `idem-${Date.now()}`,
      });

      hydrateState(response.state);

      appendLog('Configuration updated on thx-c.');
    } catch {
      appendLog("Couldn't update configuration. Try again.");
    } finally {
      setIsApplying(false);
    }
  }, [appendLog, draftState, hydrateState, isApplying, isUpdatingFirmware, status]);

  const handleUpdateMe = useCallback(async () => {
    if (!clientRef.current || status !== 'ready' || !firmwareUpdateState?.updateAvailable || isUpdatingFirmware) {
      return;
    }

    const client = clientRef.current;
    setIsUpdatePanelOpen(true);

    if (!connectedFeatures.includes('firmware_update_v1')) {
      appendLog('This firmware cannot receive direct serial updates yet.');
      return;
    }

    setIsUpdatingFirmware(true);
    stopKeepalive();

    try {
      const lookupVersion = connectedFirmwareVersion ?? firmwareUpdateState.currentVersion;
      const latestState = await refreshFirmwareUpdateState(lookupVersion, { silent: true });
      const effectiveState = latestState ?? firmwareUpdateState;

      if (!effectiveState.updateAvailable) {
        appendLog(`Firmware ${effectiveState.currentVersion} is already up to date.`);
        return;
      }

      if (!effectiveState.packageKey && !effectiveState.downloadUrl) {
        appendLog('No firmware package is available for direct flash.');
        return;
      }

      appendLog(
        `Starting direct firmware update to ${effectiveState.targetVersion ?? effectiveState.latestVersion}.`,
      );

      const packageFetchCandidates: Array<{ label: string; url: string }> = [];
      if (effectiveState.packageKey) {
        packageFetchCandidates.push({
          label: 'package_key',
          url: `/api/device/firmware/package?key=${encodeURIComponent(effectiveState.packageKey)}`,
        });
      }
      if (effectiveState.downloadUrl) {
        packageFetchCandidates.push({
          label: 'signed_url_proxy',
          url: `/api/device/firmware/package?url=${encodeURIComponent(effectiveState.downloadUrl)}`,
        });
        packageFetchCandidates.push({
          label: 'signed_url_direct',
          url: effectiveState.downloadUrl,
        });
      }

      let packagePayload: DeviceFirmwarePackage | null = null;
      const packageFetchErrors: string[] = [];

      for (const candidate of packageFetchCandidates) {
        try {
          const response = await fetch(candidate.url, { cache: 'no-store' });
          if (!response.ok) {
            packageFetchErrors.push(`${candidate.label}:${response.status}`);
            continue;
          }

          const rawPayload = (await response.json()) as unknown;
          if (!isFirmwarePackage(rawPayload)) {
            packageFetchErrors.push(`${candidate.label}:invalid_payload`);
            continue;
          }

          packagePayload = rawPayload;
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown_fetch_error';
          packageFetchErrors.push(`${candidate.label}:${message}`);
        }
      }

      if (!packagePayload) {
        throw new Error(
          `Firmware package fetch failed (${packageFetchErrors.join(', ') || 'no candidates'}).`,
        );
      }

      const isLegacy090 = effectiveState.currentVersion === '0.9.0';

      const flashWithPackage = async (pkg: DeviceFirmwarePackage) => {
        await client.flashFirmwarePackage(pkg, {
          chunkSize: isLegacy090 ? 192 : undefined,
          onProgress: (progress) => {
            if (progress.type === 'file_complete' && progress.filePath) {
              appendLog(`Flashed ${progress.filePath}.`);
            } else if (progress.type === 'commit') {
              appendLog('Firmware commit request sent to device.');
            }
          },
        });
      };

      try {
        await flashWithPackage(packagePayload);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const shouldUseLegacyRecovery = isLegacy090 && isFirmwareBeginTimeoutMessage(message);
        if (!shouldUseLegacyRecovery) {
          throw error;
        }

        appendLog('Detected 0.9.0 firmware_begin crash. Switching to legacy serial recovery...');
        await disconnectClient();
        await flashFirmwareViaLegacyRepl(packagePayload, appendLog);
        appendLog('Firmware update complete via legacy recovery. Device rebooting now.');
        setStatus('idle');
        setConnectedFirmwareVersion(null);
        setConnectedFeatures([]);
        setFirmwareUpdateState(null);
        return;
      }

      appendLog('Firmware update complete. Device will reboot; reconnect after it returns.');
      await disconnectClient();
      setStatus('idle');
      setConnectedFirmwareVersion(null);
      setConnectedFeatures([]);
      setFirmwareUpdateState(null);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      appendLog(`Firmware update failed: ${message}. Retry from 'Update Me'.`);
    } finally {
      setIsUpdatingFirmware(false);
      if (clientRef.current && statusRef.current === 'ready') {
        startKeepalive();
      }
    }
  }, [
    appendLog,
    connectedFeatures,
    connectedFirmwareVersion,
    disconnectClient,
    firmwareUpdateState,
    isUpdatingFirmware,
    refreshFirmwareUpdateState,
    startKeepalive,
    status,
    stopKeepalive,
  ]);

  const handlePresetModeChange = useCallback((mode: NotePresetMode) => {
    setDraftState((prev) => ({
      ...prev,
      notePreset: {
        ...prev.notePreset,
        mode,
      },
    }));
  }, []);

  const handlePianoColorChange = useCallback(
    (field: 'whiteKeyColor' | 'blackKeyColor', color: string) => {
      setDraftState((prev) => ({
        ...prev,
        notePreset: {
          ...prev.notePreset,
          piano: {
            ...prev.notePreset.piano,
            [field]: normalizeHexColor(color, prev.notePreset.piano[field]),
          },
        },
      }));
    },
    [],
  );

  const handleAnimatedColorChange = useCallback(
    (section: 'gradient' | 'rain', field: 'colorA' | 'colorB', color: string) => {
      setDraftState((prev) => ({
        ...prev,
        notePreset: {
          ...prev.notePreset,
          [section]: {
            ...prev.notePreset[section],
            [field]: normalizeHexColor(color, prev.notePreset[section][field]),
          },
        },
      }));
    },
    [],
  );

  const handlePresetSpeedChange = useCallback((section: 'gradient' | 'rain', rawValue: string) => {
    const parsed = Number.parseFloat(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }

    setDraftState((prev) => ({
      ...prev,
      notePreset: {
        ...prev.notePreset,
        [section]: {
          ...prev.notePreset[section],
          speed: clampPresetSpeed(parsed),
        },
      },
    }));
  }, []);

  const handleModifierChordChange = useCallback(
    (keyId: ModifierKeyId, chord: string) => {
      if (!CHORD_TYPES.includes(chord as (typeof CHORD_TYPES)[number])) {
        return;
      }

      setDraftState((prev) => ({
        ...prev,
        modifierChords: {
          ...prev.modifierChords,
          [keyId]: chord as DeviceState['modifierChords'][ModifierKeyId],
        },
      }));
    },
    [],
  );

  useEffect(() => {
    return () => {
      void disconnectClient();
    };
  }, [disconnectClient]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const isBusy = status === 'connecting' || status === 'handshaking';
  const statusLabel =
    status === 'connecting' || status === 'handshaking' ? 'connecting...' : status;
  const showUpdateButton = status === 'ready' && Boolean(firmwareUpdateState?.updateAvailable);
  const updateTargetVersion = firmwareUpdateState?.targetVersion ?? firmwareUpdateState?.latestVersion;
  const hasDirtyConfig = useMemo(
    () => !statesEqual(deviceState, draftState),
    [deviceState, draftState],
  );

  const selectedModifierChord = selectedModifierKey
    ? draftState.modifierChords[selectedModifierKey]
    : null;
  const animatedPresetSection = getAnimatedPresetSection(draftState.notePreset.mode);
  const animatedPresetSpeed = animatedPresetSection
    ? draftState.notePreset[animatedPresetSection].speed
    : null;
  const animatedPresetSpeedProgress =
    animatedPresetSpeed === null ? 0.5 : normalizePresetSpeedProgress(animatedPresetSpeed);

  return (
    <section className="relative space-y-8">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-black/60">Device</p>
        <h1 className="text-3xl uppercase tracking-[0.3em]">thx-c</h1>
        <p className="max-w-2xl text-sm text-black/70">
          change your colors, patterns, and chords here for your thx-c device.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleConnect}
          disabled={isBusy || isUpdatingFirmware}
          className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'ready' ? 'Reconnect device' : 'Connect device'}
        </button>

        <button
          type="button"
          onClick={handleDisconnect}
          disabled={!clientRef.current || isBusy || isUpdatingFirmware}
          className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Disconnect
        </button>

        {showUpdateButton && (
          <button
            type="button"
            onClick={handleUpdateMe}
            disabled={isBusy || isUpdatingFirmware}
            className="device-update-cycle rounded-full border px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUpdatingFirmware
              ? 'Updating...'
              : `Update me${updateTargetVersion ? ` (${updateTargetVersion})` : ''}`}
          </button>
        )}

        <span className="text-xs uppercase tracking-[0.3em] text-black/60">
          Status: {statusLabel}
        </span>

        {connectedFirmwareVersion && (
          <span className="text-xs uppercase tracking-[0.3em] text-black/60">
            Firmware: {connectedFirmwareVersion}
          </span>
        )}

        {isCheckingFirmware && (
          <span className="text-xs uppercase tracking-[0.3em] text-black/60">
            Checking updates...
          </span>
        )}
      </div>

      {isUpdatePanelOpen && firmwareUpdateState?.updateAvailable && (
        <div className="rounded-2xl border border-black/10 bg-black/5 p-4 text-xs uppercase tracking-[0.2em] text-black/70">
          <p>
            Update target: {updateTargetVersion ?? firmwareUpdateState.latestVersion} (direct flash)
          </p>
          {firmwareUpdateState.notes && <p className="mt-2">{firmwareUpdateState.notes}</p>}
          {firmwareUpdateState.sha256 && <p className="mt-3 normal-case">sha256: {firmwareUpdateState.sha256}</p>}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(280px,420px)_minmax(280px,1fr)]">
        <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
          <h2 className="mb-4 text-sm uppercase tracking-[0.3em]">Keypad</h2>

          <div className="grid grid-cols-4 gap-3">
            {KEYPAD_LAYOUT.flat().map((keyIndex) => {
              const isModifier = keyIndex >= 12;
              const keyId = `${keyIndex}` as ModifierKeyId;

              if (isModifier) {
                const delayMs = (keyIndex - 12) * 120;
                const style = {
                  '--modifier-delay': `${delayMs}ms`,
                } as CSSProperties;

                return (
                  <button
                    key={keyIndex}
                    type="button"
                    onClick={() => setSelectedModifierKey(keyId)}
                    style={style}
                    className={`device-modifier-cycle flex aspect-square flex-col items-center justify-center rounded-xl border text-xs uppercase tracking-[0.2em] transition ${
                      selectedModifierKey === keyId
                        ? 'border-black bg-black text-white shadow-[0_0_0_2px_rgba(0,0,0,0.9)] ring-2 ring-black'
                        : 'border-black/40 bg-black text-white'
                    }`}
                  >
                    <span className="text-[10px] opacity-70">K{keyIndex}</span>
                    <span className="mt-1 text-[11px]">{draftState.modifierChords[keyId]}</span>
                  </button>
                );
              }

              const previewColor = getNotePreviewColor(draftState, keyIndex, previewTick);
              const noteTextClass =
                previewColor.startsWith('#') && isColorDark(previewColor)
                  ? 'text-white'
                  : 'text-black';

              return (
                <div
                  key={keyIndex}
                  className={`flex aspect-square flex-col items-center justify-center rounded-xl border border-black/30 text-xs uppercase tracking-[0.2em] ${noteTextClass}`}
                  style={{ backgroundColor: previewColor }}
                >
                  <span className="text-[10px] opacity-70">K{keyIndex}</span>
                  <span className="mt-1 text-[11px]">N{keyIndex}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
          <h2 className="text-sm uppercase tracking-[0.3em]">Configuration</h2>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,1fr)_220px]">
            <div className="space-y-3">
              {draftState.notePreset.mode === 'piano' && (
                <>
                  <ColorPaletteField
                    label="Piano white key color"
                    value={draftState.notePreset.piano.whiteKeyColor}
                    onChange={(color) => handlePianoColorChange('whiteKeyColor', color)}
                  />
                  <ColorPaletteField
                    label="Piano black key color"
                    value={draftState.notePreset.piano.blackKeyColor}
                    onChange={(color) => handlePianoColorChange('blackKeyColor', color)}
                  />
                </>
              )}

              {draftState.notePreset.mode === 'gradient' && (
                <>
                  <ColorPaletteField
                    label={getPresetColorFieldLabel('gradient', 'colorA')}
                    value={draftState.notePreset.gradient.colorA}
                    onChange={(color) => handleAnimatedColorChange('gradient', 'colorA', color)}
                  />
                  <ColorPaletteField
                    label={getPresetColorFieldLabel('gradient', 'colorB')}
                    value={draftState.notePreset.gradient.colorB}
                    onChange={(color) => handleAnimatedColorChange('gradient', 'colorB', color)}
                  />
                </>
              )}

              {draftState.notePreset.mode === 'rain' && (
                <>
                  <ColorPaletteField
                    label={getPresetColorFieldLabel('rain', 'colorA')}
                    value={draftState.notePreset.rain.colorA}
                    onChange={(color) => handleAnimatedColorChange('rain', 'colorA', color)}
                  />
                  <ColorPaletteField
                    label={getPresetColorFieldLabel('rain', 'colorB')}
                    value={draftState.notePreset.rain.colorB}
                    onChange={(color) => handleAnimatedColorChange('rain', 'colorB', color)}
                  />
                </>
              )}

              {animatedPresetSection && animatedPresetSpeed !== null && (
                <div
                  className="space-y-2 rounded-xl border border-black/15 bg-white/70 p-3 text-xs uppercase tracking-[0.2em] text-black/70"
                  style={{ width: `${COLOR_PICKER_WIDTH_PX}px` }}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span>{getPresetSpeedLabel(animatedPresetSection)}</span>
                    <span className="text-[11px]">{animatedPresetSpeed.toFixed(1)}x</span>
                  </span>
                  <input
                    type="range"
                    min={NOTE_PRESET_SPEED_MIN}
                    max={NOTE_PRESET_SPEED_MAX}
                    step={0.1}
                    value={animatedPresetSpeed}
                    onChange={(event) => handlePresetSpeedChange(animatedPresetSection, event.target.value)}
                    className="audio-player__rpm-slider block w-full"
                    style={{ '--rpm-progress': animatedPresetSpeedProgress } as CSSProperties}
                  />
                </div>
              )}
            </div>

            <div className="space-y-3 lg:self-start">
              <div className="space-y-2 rounded-xl border border-black/15 bg-white/70 p-3">
                <label className="text-xs uppercase tracking-[0.2em] text-black/70">
                  Note key preset
                </label>
                <select
                  value={draftState.notePreset.mode}
                  onChange={(event) => handlePresetModeChange(event.target.value as NotePresetMode)}
                  className="w-full rounded-lg border border-black/25 bg-white/80 px-3 py-2 text-sm uppercase tracking-[0.08em] text-black"
                >
                  {NOTE_PRESET_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {PRESET_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 rounded-xl border border-black/15 bg-white/70 p-3">
                {selectedModifierKey ? (
                  <>
                    <label className="text-[11px] uppercase tracking-[0.2em] text-black/65">
                      Change chord
                    </label>
                    <select
                      value={selectedModifierChord ?? CHORD_TYPES[0]}
                      onChange={(event) => handleModifierChordChange(selectedModifierKey, event.target.value)}
                      className="w-full rounded-lg border border-black/25 bg-white px-3 py-2 text-sm uppercase tracking-[0.08em] text-black"
                    >
                      {CHORD_TYPES.map((chord) => (
                        <option key={chord} value={chord}>
                          {chord}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <p className="text-[11px] uppercase tracking-[0.2em] text-black/65">
                    Select a modifier key
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleApplyConfig}
              disabled={status !== 'ready' || !hasDirtyConfig || isApplying || isBusy || isUpdatingFirmware}
              className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isApplying ? 'Applying…' : 'Apply'}
            </button>

            <button
              type="button"
              onClick={() => setDraftState(cloneState(deviceState))}
              disabled={!hasDirtyConfig || isApplying || isUpdatingFirmware}
              className="rounded-full border border-black/30 px-6 py-3 text-xs uppercase tracking-[0.3em] transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Undo
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-black/5 p-6">
        <h2 className="text-sm uppercase tracking-[0.3em]">Session log</h2>
        <div className="mt-4 space-y-2 text-xs text-black/70">
          {log.length === 0 && <p>No activity yet. Connect your thx-c to begin.</p>}
          {log.map((entry, index) => (
            <p key={`${entry.timestamp}-${index}`}>
              [{formatLogTimestamp(entry.timestamp)}] {entry.message}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
