import json

PROTOCOL_VERSION = 1
MAX_FRAME_SIZE = 1024
UNMATCHED_ID = "unmatched"

ERROR_MALFORMED_FRAME = "malformed_frame"
ERROR_UNSUPPORTED_VERSION = "unsupported_version"
ERROR_UNSUPPORTED_TYPE = "unsupported_type"

ALLOWED_CHORD_TYPES = ("maj", "min", "maj7", "min7", "maj9", "min9", "maj79", "min79")
REQUIRED_MODIFIER_KEYS = ("12", "13", "14", "15")
ALLOWED_NOTE_PRESET_MODES = ("piano", "gradient", "rain")
HEX_DIGITS = "0123456789abcdefABCDEF"
MIN_PRESET_SPEED = 0.2
MAX_PRESET_SPEED = 3.0


def default_device_state():
    return {
        "notePreset": {
            "mode": "piano",
            "piano": {
                "whiteKeyColor": "#969696",
                "blackKeyColor": "#46466e",
            },
            "gradient": {
                "colorA": "#ff4b5a",
                "colorB": "#559bff",
                "speed": 1.0,
            },
            "rain": {
                "colorA": "#56d18d",
                "colorB": "#559bff",
                "speed": 1.0,
            },
        },
        "modifierChords": {
            "12": "min7",
            "13": "maj7",
            "14": "min",
            "15": "maj",
        },
    }


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


def make_ack(message_id, request_type, ts_ms, extra_payload=None):
    payload = {"requestType": request_type, "status": "ok"}
    if isinstance(extra_payload, dict):
        payload.update(extra_payload)
    return make_envelope("ack", message_id, payload, ts_ms)


def make_nack(message_id, request_type, code, reason, retryable, ts_ms):
    payload = {
        "requestType": request_type,
        "code": code,
        "reason": reason,
        "retryable": bool(retryable),
    }
    return make_envelope("nack", message_id, payload, ts_ms)


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


def _is_hex_color(value):
    if not isinstance(value, str) or len(value) != 7 or not value.startswith("#"):
        return False

    for char in value[1:]:
        if char not in HEX_DIGITS:
            return False

    return True


def _normalize_hex_color(value, fallback):
    if not _is_hex_color(value):
        return fallback
    return value.lower()


def _is_valid_speed(value):
    return isinstance(value, (int, float)) and MIN_PRESET_SPEED <= value <= MAX_PRESET_SPEED


def _normalize_speed(value, fallback):
    if not isinstance(value, (int, float)):
        return fallback

    if value < MIN_PRESET_SPEED:
        return MIN_PRESET_SPEED

    if value > MAX_PRESET_SPEED:
        return MAX_PRESET_SPEED

    return float(value)


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


def _validate_modifier_chords(modifier_chords):
    if not _is_object(modifier_chords):
        return False, "state.modifierChords must be an object."

    for key in REQUIRED_MODIFIER_KEYS:
        chord_name = modifier_chords.get(key)
        if not isinstance(chord_name, str):
            return False, "state.modifierChords.%s must be a string." % key
        if chord_name not in ALLOWED_CHORD_TYPES:
            return False, "state.modifierChords.%s is unsupported." % key

    return True, None


def _validate_note_preset(note_preset):
    if not _is_object(note_preset):
        return False, "state.notePreset must be an object."

    mode = note_preset.get("mode")
    if mode not in ALLOWED_NOTE_PRESET_MODES:
        return False, "state.notePreset.mode is unsupported."

    piano = note_preset.get("piano")
    if not _is_object(piano):
        return False, "state.notePreset.piano must be an object."
    if not _is_hex_color(piano.get("whiteKeyColor")):
        return False, "state.notePreset.piano.whiteKeyColor must be #RRGGBB."
    if not _is_hex_color(piano.get("blackKeyColor")):
        return False, "state.notePreset.piano.blackKeyColor must be #RRGGBB."

    gradient = note_preset.get("gradient")
    if not _is_object(gradient):
        return False, "state.notePreset.gradient must be an object."
    if not _is_hex_color(gradient.get("colorA")):
        return False, "state.notePreset.gradient.colorA must be #RRGGBB."
    if not _is_hex_color(gradient.get("colorB")):
        return False, "state.notePreset.gradient.colorB must be #RRGGBB."
    if not _is_valid_speed(gradient.get("speed")):
        return (
            False,
            "state.notePreset.gradient.speed must be between %.1f and %.1f."
            % (MIN_PRESET_SPEED, MAX_PRESET_SPEED),
        )

    rain = note_preset.get("rain")
    if not _is_object(rain):
        return False, "state.notePreset.rain must be an object."
    if not _is_hex_color(rain.get("colorA")):
        return False, "state.notePreset.rain.colorA must be #RRGGBB."
    if not _is_hex_color(rain.get("colorB")):
        return False, "state.notePreset.rain.colorB must be #RRGGBB."
    if not _is_valid_speed(rain.get("speed")):
        return (
            False,
            "state.notePreset.rain.speed must be between %.1f and %.1f."
            % (MIN_PRESET_SPEED, MAX_PRESET_SPEED),
        )

    return True, None


def validate_device_state(candidate):
    if not _is_object(candidate):
        return False, "state must be an object."

    if "notePreset" not in candidate and isinstance(candidate.get("showBlackKeys"), bool):
        if "modifierChords" in candidate:
            modifiers_valid, modifier_error = _validate_modifier_chords(
                candidate.get("modifierChords")
            )
            if not modifiers_valid:
                return False, modifier_error
        return True, None

    note_preset_valid, note_preset_error = _validate_note_preset(candidate.get("notePreset"))
    if not note_preset_valid:
        return False, note_preset_error

    modifier_chords_valid, modifier_error = _validate_modifier_chords(
        candidate.get("modifierChords")
    )
    if not modifier_chords_valid:
        return False, modifier_error

    return True, None


def normalize_device_state_candidate(candidate):
    valid_state, _ = validate_device_state(candidate)
    if not valid_state:
        return None

    defaults = default_device_state()

    if "notePreset" not in candidate and isinstance(candidate.get("showBlackKeys"), bool):
        migrated = default_device_state()
        if not candidate.get("showBlackKeys"):
            migrated["notePreset"]["piano"]["blackKeyColor"] = migrated["notePreset"][
                "piano"
            ]["whiteKeyColor"]

        if _is_object(candidate.get("modifierChords")):
            for key in REQUIRED_MODIFIER_KEYS:
                chord_name = candidate["modifierChords"].get(key)
                if isinstance(chord_name, str) and chord_name in ALLOWED_CHORD_TYPES:
                    migrated["modifierChords"][key] = chord_name

        return migrated

    note_preset = candidate["notePreset"]
    return {
        "notePreset": {
            "mode": note_preset["mode"],
            "piano": {
                "whiteKeyColor": _normalize_hex_color(
                    note_preset["piano"]["whiteKeyColor"],
                    defaults["notePreset"]["piano"]["whiteKeyColor"],
                ),
                "blackKeyColor": _normalize_hex_color(
                    note_preset["piano"]["blackKeyColor"],
                    defaults["notePreset"]["piano"]["blackKeyColor"],
                ),
            },
            "gradient": {
                "colorA": _normalize_hex_color(
                    note_preset["gradient"]["colorA"],
                    defaults["notePreset"]["gradient"]["colorA"],
                ),
                "colorB": _normalize_hex_color(
                    note_preset["gradient"]["colorB"],
                    defaults["notePreset"]["gradient"]["colorB"],
                ),
                "speed": _normalize_speed(
                    note_preset["gradient"]["speed"],
                    defaults["notePreset"]["gradient"]["speed"],
                ),
            },
            "rain": {
                "colorA": _normalize_hex_color(
                    note_preset["rain"]["colorA"],
                    defaults["notePreset"]["rain"]["colorA"],
                ),
                "colorB": _normalize_hex_color(
                    note_preset["rain"]["colorB"],
                    defaults["notePreset"]["rain"]["colorB"],
                ),
                "speed": _normalize_speed(
                    note_preset["rain"]["speed"],
                    defaults["notePreset"]["rain"]["speed"],
                ),
            },
        },
        "modifierChords": {
            "12": candidate["modifierChords"]["12"],
            "13": candidate["modifierChords"]["13"],
            "14": candidate["modifierChords"]["14"],
            "15": candidate["modifierChords"]["15"],
        },
    }


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
        return (
            False,
            "invalid_config",
            "apply_config payload must be an object.",
            False,
            None,
        )

    config_id = payload.get("configId")
    if not isinstance(config_id, str) or not config_id:
        return (
            False,
            "invalid_config",
            "apply_config payload.configId must be a string.",
            False,
            None,
        )

    idempotency_key = payload.get("idempotencyKey")
    if not isinstance(idempotency_key, str) or not idempotency_key:
        return (
            False,
            "invalid_config",
            "apply_config payload.idempotencyKey must be a string.",
            False,
            None,
        )

    normalized_state = normalize_device_state_candidate(payload.get("config"))
    if normalized_state is None:
        return False, "invalid_config", "apply_config payload.config is invalid.", False, None

    return True, None, None, False, normalized_state


def _normalize_context(context_or_capabilities):
    if _is_object(context_or_capabilities) and "capabilities" in context_or_capabilities:
        return context_or_capabilities

    return {
        "capabilities": context_or_capabilities,
        "get_state": None,
        "apply_config": None,
        "on_handshake": None,
    }


def _call_get_state(context):
    getter = context.get("get_state")
    if callable(getter):
        state = getter()
        normalized_state = normalize_device_state_candidate(state)
        if normalized_state is not None:
            return normalized_state

    capabilities = context.get("capabilities")
    if _is_object(capabilities):
        state = capabilities.get("state")
        normalized_state = normalize_device_state_candidate(state)
        if normalized_state is not None:
            return normalized_state

    return default_device_state()


def _call_apply_config(context, config, config_id, idempotency_key):
    applier = context.get("apply_config")
    if not callable(applier):
        return {
            "ok": False,
            "code": "unsupported_operation",
            "reason": "apply_config is not supported by this endpoint.",
            "retryable": False,
        }

    return applier(config, config_id, idempotency_key)


def _emit_handshake_event(context):
    callback = context.get("on_handshake")
    if callable(callback):
        try:
            callback()
        except Exception:
            pass


def dispatch_message(envelope, context, ts_ms):
    message_id = envelope["id"]
    message_type = envelope["type"]
    payload = envelope["payload"]
    capabilities = context.get("capabilities")

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

        state = _call_get_state(context)
        valid_state, state_error = validate_device_state(state)
        if not valid_state:
            return make_error(
                message_id,
                "internal_error",
                "Device state is invalid.",
                {"reason": state_error},
                ts_ms,
            )

        _emit_handshake_event(context)

        hello_payload = dict(capabilities) if _is_object(capabilities) else {}
        hello_payload["state"] = normalize_device_state_candidate(state)
        return make_envelope("hello_ack", message_id, hello_payload, ts_ms)

    if message_type == "get_state":
        state = _call_get_state(context)
        normalized_state = normalize_device_state_candidate(state)
        if normalized_state is None:
            return make_nack(
                message_id,
                "get_state",
                "internal_state_invalid",
                "Device state is invalid.",
                False,
                ts_ms,
            )

        return make_ack(message_id, "get_state", ts_ms, {"state": normalized_state})

    if message_type == "apply_config":
        payload_ok, code, reason, retryable, normalized_config = _validate_apply_config_payload(
            payload
        )
        if not payload_ok:
            return make_nack(message_id, "apply_config", code, reason, retryable, ts_ms)

        config_id = payload["configId"]
        idempotency_key = payload["idempotencyKey"]

        apply_result = _call_apply_config(
            context, normalized_config, config_id, idempotency_key
        )
        if not _is_object(apply_result):
            return make_nack(
                message_id,
                "apply_config",
                "internal_error",
                "apply_config result is invalid.",
                True,
                ts_ms,
            )

        if not apply_result.get("ok"):
            return make_nack(
                message_id,
                "apply_config",
                apply_result.get("code", "internal_error"),
                apply_result.get("reason", "Unable to apply config."),
                bool(apply_result.get("retryable", False)),
                ts_ms,
            )

        state = normalize_device_state_candidate(apply_result.get("state"))
        if state is None:
            return make_nack(
                message_id,
                "apply_config",
                "internal_state_invalid",
                "apply_config returned an invalid state.",
                False,
                ts_ms,
            )

        return make_ack(
            message_id,
            "apply_config",
            ts_ms,
            {
                "state": state,
                "appliedConfigId": apply_result.get("appliedConfigId", config_id),
            },
        )

    if message_type == "ping":
        return make_ack(message_id, "ping", ts_ms, {"pongTs": ts_ms})

    return make_error(
        message_id,
        ERROR_UNSUPPORTED_TYPE,
        "Unsupported message type.",
        {"type": message_type},
        ts_ms,
    )


def process_line(line_text, context_or_capabilities, ts_ms):
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

    context = _normalize_context(context_or_capabilities)
    return dispatch_message(envelope, context, ts_ms)


def process_serial_chunk(buffer, chunk, context_or_capabilities, ts_ms):
    if chunk:
        buffer.extend(chunk)

    responses = []

    while True:
        newline_index = buffer.find(b"\n")
        if newline_index < 0:
            break

        line_bytes = bytes(buffer[:newline_index])
        buffer[:] = buffer[newline_index + 1 :]

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

        response = process_line(line_text, context_or_capabilities, ts_ms)
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
