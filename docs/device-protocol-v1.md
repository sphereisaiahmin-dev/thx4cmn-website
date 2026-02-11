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

## Message Types

### Host -> Device

- `hello`
- `apply_config`

`hello.payload`:

- `client` (string): host client identifier.
- `requestedProtocolVersion` (number): must be `1`.

`apply_config.payload`:

- `modifierChords` (object): key-to-chord map for modifier keys `"12"`, `"13"`, `"14"`, `"15"`.
- `noteKeyColorPresets` (object): key-to-preset map for note keys `"0"` through `"11"`.
- `idempotencyKey` (string): client-generated idempotency key.
- `configVersion` (number): host config revision.

Expected UI/display key assignment:

- `row1: 0 4 8 12`
- `row2: 1 5 9 13`
- `row3: 2 6 10 14`
- `row4: 3 7 11 15`

Supported chord values:

- `maj`, `min`, `maj7`, `min7`, `maj9`, `min9`, `maj79`, `min79`

Chord voicings (all include 5th):

- `maj: (0,4,7)`
- `min: (0,3,7)`
- `maj7: (0,4,7,11)`
- `min7: (0,3,7,10)`
- `maj9: (0,4,7,14)`
- `min9: (0,3,7,14)`
- `maj79: (0,4,7,11,14)`
- `min79: (0,3,7,10,14)`

Supported note preset values:

- `piano`
- `aurora_scene`
- `sunset_scene`
- `ocean_scene`

`piano` preset key coloring:

- black keys (note indices `1,3,6,8,10`) use dark blue.
- white keys (note indices `0,2,4,5,7,9,11`) use white.

### Device -> Host

- `hello_ack`
- `ack`
- `nack`
- `error`

`hello_ack.payload`:

- `device` (string): device name/model.
- `protocolVersion` (number): `1`.
- `features` (array<string>): supported feature flags.
- `firmwareVersion` (string): firmware version string.

`ack.payload`:

- `requestType` (string): currently `"apply_config"`.
- `status` (string): `"ok"`.
- `appliedConfigVersion` (number): applied device config version.

`nack.payload`:

- `requestType` (string): currently `"apply_config"`.
- `code` (string): machine-readable rejection code.
- `reason` (string): human-readable summary.
- `retryable` (boolean): whether retry is recommended.

`error.payload`:

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

## Correlation Rules

- Host always sends request ids (`id`).
- Device responses (`hello_ack`, `ack`, `nack`, or `error`) must echo the same `id` whenever request parsing reached the envelope stage.
- If parsing fails before a valid `id` is available, device should use `id: "unmatched"`.

## Compatibility Mode

- Hard cutover to protocol v1.
- Legacy plain-text `ping` and legacy JSON payloads (`{chords, baseColor}`) are not supported.
