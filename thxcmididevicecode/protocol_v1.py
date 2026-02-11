import json

PROTOCOL_VERSION = 1
MAX_FRAME_SIZE = 1024
UNMATCHED_ID = "unmatched"

ERROR_MALFORMED_FRAME = "malformed_frame"
ERROR_UNSUPPORTED_VERSION = "unsupported_version"
ERROR_UNSUPPORTED_TYPE = "unsupported_type"

def make_envelope(message_type, message_id, payload, ts_ms):
    return {
        "v": PROTOCOL_VERSION,
        "type": message_type,
        "id": message_id,
        "ts": ts_ms,
        "payload": payload,
    }


def make_error(message_id, code, message, details, ts_ms):
    payload = {"code": code, "message": message}
    if details is not None:
        payload["details"] = details
    return make_envelope("error", message_id, payload, ts_ms)


def make_ack(message_id, request_type, applied_config_version, ts_ms):
    return make_envelope(
        "ack",
        message_id,
        {
            "requestType": request_type,
            "status": "ok",
            "appliedConfigVersion": applied_config_version,
        },
        ts_ms,
    )


def make_nack(message_id, request_type, code, reason, retryable, ts_ms):
    return make_envelope(
        "nack",
        message_id,
        {
            "requestType": request_type,
            "code": code,
            "reason": reason,
            "retryable": retryable,
        },
        ts_ms,
    )


def encode_frame(frame):
    return (json.dumps(frame, separators=(",", ":")) + "\n").encode("utf-8")


def _extract_message_id(candidate):
    if isinstance(candidate, dict):
        message_id = candidate.get("id")
        if isinstance(message_id, str) and message_id:
            return message_id
    return UNMATCHED_ID


def _is_object(value):
    return isinstance(value, dict)


def validate_envelope(envelope):
    if not _is_object(envelope):
        return False, ERROR_MALFORMED_FRAME, "Envelope must be an object."

    required = {
        "v": int,
        "type": str,
        "id": str,
        "ts": (int, float),
        "payload": dict,
    }

    for key, expected_type in required.items():
        if key not in envelope:
            return (
                False,
                ERROR_MALFORMED_FRAME,
                "Missing required envelope field: %s" % key,
            )

        value = envelope[key]
        if key == "payload":
            if not _is_object(value):
                return False, ERROR_MALFORMED_FRAME, "Envelope payload must be an object."
            continue

        if not isinstance(value, expected_type):
            return (
                False,
                ERROR_MALFORMED_FRAME,
                "Invalid envelope field type for: %s" % key,
            )

    if envelope["v"] != PROTOCOL_VERSION:
        return False, ERROR_UNSUPPORTED_VERSION, "Unsupported protocol version."

    if not envelope["id"]:
        return False, ERROR_MALFORMED_FRAME, "Envelope id must be a non-empty string."

    if not envelope["type"]:
        return False, ERROR_MALFORMED_FRAME, "Envelope type must be a non-empty string."

    return True, None, None


def _validate_hello_payload(payload):
    if not _is_object(payload):
        return False, ERROR_MALFORMED_FRAME, "hello payload must be an object."

    client = payload.get("client")
    if not isinstance(client, str) or not client:
        return False, ERROR_MALFORMED_FRAME, "hello payload.client must be a non-empty string."

    requested_version = payload.get("requestedProtocolVersion")
    if not isinstance(requested_version, int):
        return (
            False,
            ERROR_MALFORMED_FRAME,
            "hello payload.requestedProtocolVersion must be a number.",
        )

    if requested_version != PROTOCOL_VERSION:
        return False, ERROR_UNSUPPORTED_VERSION, "Requested protocol version is unsupported."

    return True, None, None


def _validate_apply_config_payload(payload):
    if not _is_object(payload):
        return False, "apply_config payload must be an object."

    modifier_chords = payload.get("modifierChords")
    if not _is_object(modifier_chords):
        return False, "apply_config payload.modifierChords must be an object."

    for key, value in modifier_chords.items():
        if not isinstance(key, str) or not key:
            return False, "apply_config payload.modifierChords keys must be strings."
        if not isinstance(value, str) or not value:
            return False, "apply_config payload.modifierChords values must be strings."

    note_key_color_presets = payload.get("noteKeyColorPresets")
    if not _is_object(note_key_color_presets):
        return False, "apply_config payload.noteKeyColorPresets must be an object."

    for key, value in note_key_color_presets.items():
        if not isinstance(key, str) or not key:
            return False, "apply_config payload.noteKeyColorPresets keys must be strings."
        if not isinstance(value, str) or not value:
            return False, "apply_config payload.noteKeyColorPresets values must be strings."

    idempotency_key = payload.get("idempotencyKey")
    if not isinstance(idempotency_key, str) or not idempotency_key:
        return False, "apply_config payload.idempotencyKey must be a non-empty string."

    config_version = payload.get("configVersion")
    if not isinstance(config_version, int):
        return False, "apply_config payload.configVersion must be a number."

    if config_version < 1:
        return False, "apply_config payload.configVersion must be >= 1."

    return True, None


def _dispatch_apply_config(message_id, payload, ts_ms, apply_config_handler):
    valid_payload, payload_error = _validate_apply_config_payload(payload)
    if not valid_payload:
        return make_error(
            message_id,
            ERROR_MALFORMED_FRAME,
            payload_error,
            {"type": "apply_config"},
            ts_ms,
        )

    if apply_config_handler is None:
        return make_nack(
            message_id,
            "apply_config",
            "not_supported",
            "apply_config is not implemented on this device.",
            False,
            ts_ms,
        )

    try:
        result = apply_config_handler(payload)
    except Exception as exc:
        return make_nack(
            message_id,
            "apply_config",
            "apply_failed",
            "Unable to apply configuration: %s" % exc,
            True,
            ts_ms,
        )

    if not _is_object(result):
        return make_nack(
            message_id,
            "apply_config",
            "apply_failed",
            "apply_config handler returned invalid result.",
            True,
            ts_ms,
        )

    if result.get("ok"):
        applied_version = result.get("appliedConfigVersion", payload["configVersion"])
        return make_ack(message_id, "apply_config", applied_version, ts_ms)

    return make_nack(
        message_id,
        "apply_config",
        result.get("code", "invalid_config"),
        result.get("reason", "Configuration was rejected."),
        bool(result.get("retryable", False)),
        ts_ms,
    )


def dispatch_message(envelope, capabilities, ts_ms, apply_config_handler=None):
    message_id = envelope["id"]
    message_type = envelope["type"]
    payload = envelope["payload"]

    if message_type == "hello":
        valid_payload, payload_error_code, payload_error_message = _validate_hello_payload(
            payload
        )
        if not valid_payload:
            return make_error(
                message_id,
                payload_error_code,
                payload_error_message,
                {"type": message_type},
                ts_ms,
            )

        return make_envelope("hello_ack", message_id, capabilities, ts_ms)

    if message_type == "apply_config":
        return _dispatch_apply_config(message_id, payload, ts_ms, apply_config_handler)

    return make_error(
        message_id,
        ERROR_UNSUPPORTED_TYPE,
        "Unsupported message type.",
        {"type": message_type},
        ts_ms,
    )


def process_line(line_text, capabilities, ts_ms, apply_config_handler=None):
    try:
        envelope = json.loads(line_text)
    except ValueError:
        return make_error(
            UNMATCHED_ID,
            ERROR_MALFORMED_FRAME,
            "Frame is not valid JSON.",
            None,
            ts_ms,
        )

    message_id = _extract_message_id(envelope)
    valid, error_code, error_message = validate_envelope(envelope)
    if not valid:
        return make_error(message_id, error_code, error_message, None, ts_ms)

    return dispatch_message(envelope, capabilities, ts_ms, apply_config_handler)


def process_serial_chunk(buffer, chunk, capabilities, ts_ms, apply_config_handler=None):
    if chunk:
        buffer.extend(chunk)

    responses = []

    while True:
        newline_index = buffer.find(b"\n")
        if newline_index < 0:
            break

        line_bytes = bytes(buffer[:newline_index])
        del buffer[: newline_index + 1]

        if line_bytes.endswith(b"\r"):
            line_bytes = line_bytes[:-1]

        if len(line_bytes) == 0:
            responses.append(
                encode_frame(
                    make_error(
                        UNMATCHED_ID,
                        ERROR_MALFORMED_FRAME,
                        "Frame is empty.",
                        None,
                        ts_ms,
                    )
                )
            )
            continue

        if len(line_bytes) > MAX_FRAME_SIZE:
            responses.append(
                encode_frame(
                    make_error(
                        UNMATCHED_ID,
                        ERROR_MALFORMED_FRAME,
                        "Frame exceeds maximum size.",
                        {
                            "maxFrameSize": MAX_FRAME_SIZE,
                            "actualSize": len(line_bytes),
                        },
                        ts_ms,
                    )
                )
            )
            continue

        try:
            line_text = line_bytes.decode("utf-8")
        except UnicodeError:
            responses.append(
                encode_frame(
                    make_error(
                        UNMATCHED_ID,
                        ERROR_MALFORMED_FRAME,
                        "Frame is not valid UTF-8.",
                        None,
                        ts_ms,
                    )
                )
            )
            continue

        response = process_line(line_text, capabilities, ts_ms, apply_config_handler)
        responses.append(encode_frame(response))

    if len(buffer) > MAX_FRAME_SIZE:
        responses.append(
            encode_frame(
                make_error(
                    UNMATCHED_ID,
                    ERROR_MALFORMED_FRAME,
                    "Missing newline terminator before max frame size.",
                    {"maxFrameSize": MAX_FRAME_SIZE},
                    ts_ms,
                )
            )
        )
        buffer.clear()

    return responses
