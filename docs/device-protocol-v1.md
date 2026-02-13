# Device Protocol v1 (NDJSON)

This document defines the USB serial protocol between the website host and Pico firmware.

## Transport

- Transport: USB CDC serial.
- Framing: NDJSON v1 (`one JSON object per line`).
- Each frame **must** terminate with `\n`.
- `\r\n` is accepted, but `\n` is still required.
- Maximum frame payload size: `1024` bytes, **excluding** the trailing newline.
- UTF-8 encoding only.

## Envelope (required for every frame)

```json
{
  "v": 1,
  "type": "hello",
  "id": "host-generated-id",
  "ts": 1739294400000,
  "payload": {}
}
```

Required fields:

- `v` (number): protocol version, must be `1`.
- `type` (string): message type.
- `id` (string): host-generated request id for request/response correlation.
- `ts` (number): epoch milliseconds.
- `payload` (object): type-specific payload.

Validation is strict:

- Unknown top-level fields may be ignored.
- Missing required fields, wrong field types, non-object payloads, invalid JSON, invalid UTF-8, or oversize frames are `malformed_frame` errors.
- `v !== 1` is `unsupported_version`.
- Unknown/unsupported message `type` is `unsupported_type`.

## State Model

`DeviceState`:

```json
{
  "notePreset": {
    "mode": "piano",
    "piano": {
      "whiteKeyColor": "#969696",
      "blackKeyColor": "#46466e"
    },
    "gradient": {
      "colorA": "#ff4b5a",
      "colorB": "#559bff",
      "speed": 1.0
    },
    "rain": {
      "colorA": "#56d18d",
      "colorB": "#559bff",
      "speed": 1.0
    }
  },
  "modifierChords": {
    "12": "min7",
    "13": "maj7",
    "14": "min",
    "15": "maj"
  }
}
```

- `notePreset` (object): note-key lighting and animation preset configuration.
  - `mode` (string): one of `piano`, `gradient`, `rain`.
  - `piano.whiteKeyColor` (string): hex color `#RRGGBB`.
  - `piano.blackKeyColor` (string): hex color `#RRGGBB`.
  - `gradient.colorA` / `gradient.colorB` (string): hex colors `#RRGGBB`.
  - `gradient.speed` (number): animation speed in range `0.2` to `3.0`.
  - `rain.colorA` / `rain.colorB` (string): hex colors `#RRGGBB`.
  - `rain.speed` (number): animation speed in range `0.2` to `3.0`.
- `modifierChords` (object): chord assignment for modifier keys `12`, `13`, `14`, and `15`.

Allowed chord values:

- `maj`
- `min`
- `maj7`
- `min7`
- `maj9`
- `min9`

## Message Types

### Host -> Device

- `hello`
- `get_state`
- `apply_config`
- `ping`

#### `hello.payload`

- `client` (string): host client identifier.
- `requestedProtocolVersion` (number): must be `1`.

#### `get_state.payload`

- Empty object `{}`.

#### `apply_config.payload`

- `configId` (string): host-generated config version id.
- `idempotencyKey` (string): dedupe key for safe retries.
- `config` (`DeviceState`): proposed device config.

#### `ping.payload`

- Optional object payload. Empty object is valid.

### Device -> Host

- `hello_ack`
- `ack`
- `nack`
- `error`

#### `hello_ack.payload`

- `device` (string): device name/model.
- `protocolVersion` (number): `1`.
- `features` (array<string>): supported feature flags.
- `firmwareVersion` (string): firmware version string.
- `state` (`DeviceState`): current applied state.

#### `ack.payload`

- `requestType` (string): request type being acknowledged.
- `status` (string): always `ok`.
- Optional fields by request:
  - `state` (`DeviceState`): returned for `get_state` and `apply_config`.
  - `appliedConfigId` (string): returned for `apply_config`.
  - `pongTs` (number): returned for `ping`.

#### `nack.payload`

- `requestType` (string): request type being rejected.
- `code` (string): machine-readable failure code.
- `reason` (string): human-readable summary.
- `retryable` (boolean): indicates retry guidance.

#### `error.payload`

- `code` (string): machine-readable error code.
- `message` (string): human-readable summary.
- `details` (object, optional): extra diagnostic data.

## Error Codes

- `malformed_frame`
  - Invalid JSON, invalid UTF-8, missing/wrong envelope fields, payload not object, frame too large, or missing newline once the un-terminated buffer exceeds max frame size.
- `unsupported_version`
  - Envelope version is not `1`.
- `unsupported_type`
  - Message type is not supported by the current endpoint.

For `nack` payloads, implementation-defined codes may be used (e.g., `invalid_config`, `config_persist_failed`, `internal_error`).

## Correlation Rules

- Host always sends request ids (`id`).
- Device responses (`hello_ack`, `ack`, `nack`, or `error`) must echo the same `id` whenever request parsing reached the envelope stage.
- If parsing fails before a valid `id` is available, device should use `id: "unmatched"`.

## Compatibility Mode

- Hard cutover to protocol v1 envelope.
- Legacy plain-text `ping` and legacy JSON payloads (`{chords, baseColor}`) are not supported.
- Legacy config/state payloads with `showBlackKeys` and no `notePreset` are accepted and migrated to
  default `notePreset.mode = "piano"` behavior.
