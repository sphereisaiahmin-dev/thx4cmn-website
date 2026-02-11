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

`hello.payload`:

- `client` (string): host client identifier.
- `requestedProtocolVersion` (number): must be `1`.

### Device -> Host

- `hello_ack`

`hello_ack.payload`:

- `device` (string): device name/model.
- `protocolVersion` (number): `1`.
- `features` (array<string>): supported feature flags.
- `firmwareVersion` (string): firmware version string.

- `error`

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
- Device responses (`hello_ack` or `error`) must echo the same `id` whenever request parsing reached the envelope stage.
- If parsing fails before a valid `id` is available, device should use `id: "unmatched"`.

## Compatibility Mode

- Hard cutover to protocol v1.
- Legacy plain-text `ping` and legacy JSON payloads (`{chords, baseColor}`) are not supported.
