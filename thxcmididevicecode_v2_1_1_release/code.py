import json
import math
import time

STARTUP_DELAY_SECONDS = 0.6
time.sleep(STARTUP_DELAY_SECONDS)

from keybow2040 import Keybow2040, hsv_to_rgb
# from keybow_hardware.pim56x import PIM56X as Hardware # for Keybow 2040
from keybow_hardware.pim551 import PIM551 as Hardware  # for Pico RGB Keypad Base

import usb_midi
import usb_cdc
import adafruit_midi
from adafruit_midi.note_off import NoteOff
from adafruit_midi.note_on import NoteOn

from protocol_v1 import PROTOCOL_VERSION, process_serial_chunk, validate_device_state

keybow = Keybow2040(Hardware())
keys = keybow.keys

BRIGHTNESS_SCALE = 0.9
FIRMWARE_VERSION = "2.1.1"
DEVICE_NAME = "thx-c pico midi"
DEVICE_STATE_FILE = "/device_state.json"

NOTE_KEY_INDICES = tuple(range(12))
MODIFIER_KEY_INDICES = (12, 13, 14, 15)
ALT_TOGGLE_KEY_INDEX = 12
VELOCITY_KEY_INDEX = 13
OCTAVE_DOWN_KEY_INDEX = 14
OCTAVE_UP_KEY_INDEX = 15

OSCILLATE_MIN = 10
OSCILLATE_MAX = 140
OSCILLATE_SPEED = 2.2
WHITE_NOTE_COLOR = (150, 150, 150)
BLACK_NOTE_COLOR = (70, 70, 110)
BLACK_NOTE_INDICES = (1, 3, 6, 8, 10)
ALT_ACTIVE_COLOR = (0, 0, 255)
MODIFIER_ALT_IDLE_COLOR = (120, 120, 120)

BASE_NOTE_OFFSET = 0
ALT_TOGGLE_WINDOW = 0.45

VELOCITY_LEVELS = (127, 80, 40)
VELOCITY_COLORS = (
    (255, 0, 0),
    (0, 255, 0),
    (0, 0, 255),
)

BASE_NOTES = tuple(range(60, 72))
MIN_OCTAVE_OFFSET = -36
MAX_OCTAVE_OFFSET = 36
MAX_CHORD_INTERVAL = 14
EMERGENCY_NOTE_MIN = min(BASE_NOTES) + BASE_NOTE_OFFSET + MIN_OCTAVE_OFFSET
EMERGENCY_NOTE_MAX = (
    max(BASE_NOTES) + BASE_NOTE_OFFSET + MAX_OCTAVE_OFFSET + MAX_CHORD_INTERVAL
)
EMERGENCY_NOTE_RANGE = range(EMERGENCY_NOTE_MIN, EMERGENCY_NOTE_MAX + 1)

CHORD_INTERVALS_BY_NAME = {
    "maj": (0, 4, 7),
    "min": (0, 3, 7),
    "maj7": (0, 4, 11),
    "min7": (0, 3, 10),
    "maj9": (0, 4, 7, 11, 14),
    "min9": (0, 3, 7, 10, 14),
}

DEFAULT_DEVICE_STATE = {
    "showBlackKeys": False,
    "modifierChords": {
        "12": "min7",
        "13": "maj7",
        "14": "min",
        "15": "maj",
    },
}

active_chord_notes = []
active_notes = {}
last_alt_press_time = None
alt_mode_active = False
octave_offset = 0
velocity_index = 0
serial_buffer = bytearray()
last_applied_idempotency_key = None
last_applied_config_id = None
acceptance_animation_queued = False

device_state = None
modifier_chord_types = {
    15: "maj",
    14: "min",
    13: "maj7",
    12: "min7",
}

protocol_capabilities = {
    "device": DEVICE_NAME,
    "protocolVersion": PROTOCOL_VERSION,
    "features": [
        "handshake",
        "get_state",
        "apply_config",
        "ping",
        "config_persistence",
    ],
    "firmwareVersion": FIRMWARE_VERSION,
}


midi = adafruit_midi.MIDI(midi_out=usb_midi.ports[1], out_channel=0)


def set_led_scaled(index, red, green, blue):
    keybow.set_led(
        index,
        int(red * BRIGHTNESS_SCALE),
        int(green * BRIGHTNESS_SCALE),
        int(blue * BRIGHTNESS_SCALE),
    )


def oscillating_channel(time_value, phase):
    span = OSCILLATE_MAX - OSCILLATE_MIN
    return OSCILLATE_MIN + int(span * (math.sin(time_value + phase) + 1) / 2)


def note_to_key_index(note):
    return (note - 60) % 12


def current_note_offset():
    return BASE_NOTE_OFFSET + octave_offset


def adjust_octave_offset(step):
    global octave_offset
    octave_offset = max(MIN_OCTAVE_OFFSET, min(MAX_OCTAVE_OFFSET, octave_offset + step))


def send_midi(message):
    if isinstance(message, list):
        for msg in message:
            midi.send(msg)
    else:
        midi.send(message)


def any_note_pressed():
    for index in NOTE_KEY_INDICES:
        if keys[index].pressed:
            return True
    return False


def clone_device_state(state):
    return {
        "showBlackKeys": bool(state["showBlackKeys"]),
        "modifierChords": {
            "12": state["modifierChords"]["12"],
            "13": state["modifierChords"]["13"],
            "14": state["modifierChords"]["14"],
            "15": state["modifierChords"]["15"],
        },
    }


def default_device_state():
    return clone_device_state(DEFAULT_DEVICE_STATE)


def normalize_device_state(candidate):
    valid, _ = validate_device_state(candidate)
    if not valid:
        return None

    return {
        "showBlackKeys": bool(candidate.get("showBlackKeys")),
        "modifierChords": {
            "12": candidate["modifierChords"]["12"],
            "13": candidate["modifierChords"]["13"],
            "14": candidate["modifierChords"]["14"],
            "15": candidate["modifierChords"]["15"],
        },
    }


def load_device_state():
    try:
        with open(DEVICE_STATE_FILE, "r") as handle:
            loaded = json.loads(handle.read())
    except (OSError, ValueError):
        return default_device_state()

    normalized = normalize_device_state(loaded)
    if normalized is None:
        return default_device_state()

    return normalized


def persist_device_state(state):
    try:
        with open(DEVICE_STATE_FILE, "w") as handle:
            json.dump(state, handle)
        return True, None
    except OSError as exc:
        return False, "Unable to persist config: %s" % exc


def snapshot_device_state():
    return clone_device_state(device_state)


def note_base_color(index):
    if not device_state["showBlackKeys"]:
        return WHITE_NOTE_COLOR

    if index in BLACK_NOTE_INDICES:
        return BLACK_NOTE_COLOR

    return WHITE_NOTE_COLOR


def restore_note_led(index):
    set_led_scaled(index, *note_base_color(index))


def paint_base_note_leds():
    for index in NOTE_KEY_INDICES:
        restore_note_led(index)


def paint_modifier_base_leds():
    for index in MODIFIER_KEY_INDICES:
        set_led_scaled(index, 0, 0, 0)


def paint_idle_layout():
    paint_base_note_leds()
    paint_modifier_base_leds()


def set_active_chord_notes(notes):
    previous_notes = list(active_chord_notes)
    active_chord_notes.clear()
    for note in notes:
        index = note_to_key_index(note)
        if index not in active_chord_notes:
            active_chord_notes.append(index)

    for index in previous_notes:
        if index not in active_chord_notes:
            restore_note_led(index)


def clear_active_chord_notes():
    for index in active_chord_notes:
        restore_note_led(index)
    active_chord_notes.clear()


def refresh_active_chord_notes():
    notes = []
    for note_list in active_notes.values():
        notes.extend(note_list)
    set_active_chord_notes(notes)


def run_acceptance_animation():
    steps = 18

    for step in range(steps):
        value = step / (steps - 1)
        for index in range(16):
            hue = (index / 16.0 + step * 0.04) % 1.0
            red, green, blue = hsv_to_rgb(hue, 1.0, value)
            set_led_scaled(index, red, green, blue)
        time.sleep(0.012)

    for step in range(steps - 1, -1, -1):
        value = step / (steps - 1)
        for index in range(16):
            hue = (index / 16.0 + step * 0.04) % 1.0
            red, green, blue = hsv_to_rgb(hue, 1.0, value)
            set_led_scaled(index, red, green, blue)
        time.sleep(0.012)

    paint_idle_layout()
    refresh_active_chord_notes()


def queue_acceptance_animation():
    global acceptance_animation_queued
    acceptance_animation_queued = True


def maybe_run_queued_acceptance_animation():
    global acceptance_animation_queued
    if not acceptance_animation_queued:
        return

    acceptance_animation_queued = False
    run_acceptance_animation()


def apply_device_state_runtime(state):
    global device_state, modifier_chord_types

    device_state = clone_device_state(state)
    modifier_chords = device_state["modifierChords"]
    modifier_chord_types = {
        12: modifier_chords["12"],
        13: modifier_chords["13"],
        14: modifier_chords["14"],
        15: modifier_chords["15"],
    }

    paint_idle_layout()
    refresh_active_chord_notes()


def update_modifier_leds(time_value):
    if alt_mode_active:
        up_color = (
            ALT_ACTIVE_COLOR if keys[OCTAVE_UP_KEY_INDEX].pressed else MODIFIER_ALT_IDLE_COLOR
        )
        down_color = (
            ALT_ACTIVE_COLOR
            if keys[OCTAVE_DOWN_KEY_INDEX].pressed
            else MODIFIER_ALT_IDLE_COLOR
        )
        exit_color = (
            ALT_ACTIVE_COLOR
            if keys[ALT_TOGGLE_KEY_INDEX].pressed
            else MODIFIER_ALT_IDLE_COLOR
        )
        set_led_scaled(OCTAVE_UP_KEY_INDEX, *up_color)
        set_led_scaled(OCTAVE_DOWN_KEY_INDEX, *down_color)
        set_led_scaled(VELOCITY_KEY_INDEX, *VELOCITY_COLORS[velocity_index])
        set_led_scaled(ALT_TOGGLE_KEY_INDEX, *exit_color)
        return

    for offset, index in enumerate(MODIFIER_KEY_INDICES):
        set_led_scaled(
            index,
            oscillating_channel(time_value, 0.6 + offset),
            oscillating_channel(time_value, 2.7 + offset),
            oscillating_channel(time_value, 4.8 + offset),
        )


def update_note_leds(time_value):
    if active_chord_notes:
        for offset, index in enumerate(active_chord_notes):
            set_led_scaled(
                index,
                oscillating_channel(time_value, 0.0 + offset),
                oscillating_channel(time_value, 2.1 + offset),
                oscillating_channel(time_value, 4.2 + offset),
            )
    update_modifier_leds(time_value)


def roll_chord(messages, delay=0.012):
    for message in messages:
        send_midi(message)
        time.sleep(delay)


def emergency_note_off():
    send_midi([NoteOff(note, 0) for note in EMERGENCY_NOTE_RANGE])
    active_notes.clear()
    clear_active_chord_notes()


def protocol_now_ms():
    return int(time.time() * 1000)


def protocol_get_state():
    return snapshot_device_state()


def protocol_apply_config(config, config_id, idempotency_key):
    global last_applied_idempotency_key, last_applied_config_id

    if idempotency_key == last_applied_idempotency_key:
        return {
            "ok": True,
            "state": snapshot_device_state(),
            "appliedConfigId": last_applied_config_id or config_id,
        }

    normalized = normalize_device_state(config)
    if normalized is None:
        return {
            "ok": False,
            "code": "invalid_config",
            "reason": "Config is invalid.",
            "retryable": False,
        }

    persisted, persist_error = persist_device_state(normalized)
    if not persisted:
        return {
            "ok": False,
            "code": "config_persist_failed",
            "reason": persist_error,
            "retryable": True,
        }

    emergency_note_off()
    apply_device_state_runtime(normalized)

    last_applied_idempotency_key = idempotency_key
    last_applied_config_id = config_id

    queue_acceptance_animation()

    return {
        "ok": True,
        "state": snapshot_device_state(),
        "appliedConfigId": config_id,
    }


def protocol_on_handshake():
    queue_acceptance_animation()


def active_serial_channel():
    if usb_cdc.data is not None and usb_cdc.data.connected:
        return usb_cdc.data

    if usb_cdc.console is not None and usb_cdc.console.connected:
        return usb_cdc.console

    return None


def poll_serial():
    channel = active_serial_channel()
    if channel is None:
        return

    chunk = b""
    waiting = channel.in_waiting
    if waiting:
        chunk = channel.read(waiting) or b""

    responses = process_serial_chunk(serial_buffer, chunk, protocol_context, protocol_now_ms())
    for response in responses:
        channel.write(response)

    maybe_run_queued_acceptance_animation()


def chord_intervals():
    if alt_mode_active:
        return (0,)

    pressed_modifiers = [index for index in MODIFIER_KEY_INDICES if keys[index].pressed]
    if len(pressed_modifiers) == 1:
        chord_name = modifier_chord_types.get(pressed_modifiers[0])
        if chord_name:
            return CHORD_INTERVALS_BY_NAME.get(chord_name, (0,))

    return (0,)


def handle_note_press(key_index, base_note):
    global last_alt_press_time
    last_alt_press_time = None

    intervals = chord_intervals()
    if intervals is None:
        return

    note_offset = current_note_offset()
    note_numbers = [base_note + note_offset + interval for interval in intervals]
    velocity = VELOCITY_LEVELS[velocity_index]

    if len(note_numbers) == 1:
        send_midi(NoteOn(note_numbers[0], velocity))
    else:
        roll_chord([NoteOn(note, velocity) for note in note_numbers])

    active_notes[key_index] = note_numbers
    refresh_active_chord_notes()


def handle_note_release(key_index):
    note_numbers = active_notes.pop(key_index, None)
    if not note_numbers:
        return

    messages = [NoteOff(note, 0) for note in note_numbers]
    send_midi(messages if len(messages) > 1 else messages[0])
    refresh_active_chord_notes()


def handle_alt_toggle():
    global alt_mode_active, last_alt_press_time

    now = time.monotonic()
    if alt_mode_active:
        alt_mode_active = False
        last_alt_press_time = None
        return

    if (
        last_alt_press_time
        and now - last_alt_press_time <= ALT_TOGGLE_WINDOW
        and not any_note_pressed()
    ):
        alt_mode_active = True
        last_alt_press_time = None
        emergency_note_off()
        return

    last_alt_press_time = now


def handle_alt_modifier_press(index):
    global velocity_index

    if not alt_mode_active:
        return

    if index == OCTAVE_UP_KEY_INDEX:
        adjust_octave_offset(12)
    elif index == OCTAVE_DOWN_KEY_INDEX:
        adjust_octave_offset(-12)
    elif index == VELOCITY_KEY_INDEX:
        velocity_index = (velocity_index + 1) % len(VELOCITY_LEVELS)


def initialize_runtime_state():
    loaded_state = load_device_state()
    apply_device_state_runtime(loaded_state)


initialize_runtime_state()

protocol_context = {
    "capabilities": protocol_capabilities,
    "get_state": protocol_get_state,
    "apply_config": protocol_apply_config,
    "on_handshake": protocol_on_handshake,
}

for index, base_note in enumerate(BASE_NOTES):
    key = keys[index]

    @keybow.on_press(key)
    def press_handler(key, index=index, base_note=base_note):
        handle_note_press(index, base_note)

    @keybow.on_release(key)
    def release_handler(key, index=index):
        handle_note_release(index)


for index in MODIFIER_KEY_INDICES:
    key = keys[index]

    @keybow.on_press(key)
    def press_handler(key, index=index):
        if index == ALT_TOGGLE_KEY_INDEX:
            handle_alt_toggle()
            return
        handle_alt_modifier_press(index)

    @keybow.on_release(key)
    def release_handler(key):
        if not alt_mode_active:
            emergency_note_off()


while True:
    keybow.update()
    update_note_leds(time.monotonic() * OSCILLATE_SPEED)
    poll_serial()
