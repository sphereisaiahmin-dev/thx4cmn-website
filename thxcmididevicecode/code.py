import math
import time

from keybow2040 import Keybow2040
# from keybow_hardware.pim56x import PIM56X as Hardware # for Keybow 2040
from keybow_hardware.pim551 import PIM551 as Hardware  # for Pico RGB Keypad Base

import usb_midi
import usb_cdc
import adafruit_midi
from adafruit_midi.note_off import NoteOff
from adafruit_midi.note_on import NoteOn

from protocol_v1 import PROTOCOL_VERSION, process_serial_chunk

keybow = Keybow2040(Hardware())
keys = keybow.keys

BRIGHTNESS_SCALE = 0.9
FIRMWARE_VERSION = "1.1.0"
DEVICE_NAME = "thx-c pico midi"

NOTE_KEY_INDICES = tuple(range(12))
MODIFIER_KEY_INDICES = (12, 13, 14, 15)
ALT_TOGGLE_KEY_INDEX = 12
VELOCITY_KEY_INDEX = 13
OCTAVE_DOWN_KEY_INDEX = 14
OCTAVE_UP_KEY_INDEX = 15

OSCILLATE_MIN = 10
OSCILLATE_MAX = 140
OSCILLATE_SPEED = 2.2
ALT_ACTIVE_COLOR = (0, 0, 255)
PIANO_BLACK_COLOR = (24, 42, 78)
PIANO_WHITE_COLOR = (235, 235, 235)
PIANO_BLACK_KEY_INDICES = {1, 3, 6, 8, 10}

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

NOTE_PRESET_IDS = ("piano", "aurora_scene", "sunset_scene", "ocean_scene")
SWEEP_ORDER = (0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15)
EXPECTED_MODIFIER_KEY_STRINGS = {str(index) for index in MODIFIER_KEY_INDICES}
EXPECTED_NOTE_KEY_STRINGS = {str(index) for index in NOTE_KEY_INDICES}

active_chord_notes = []
active_notes = {}
last_alt_press_time = None
alt_mode_active = False
octave_offset = 0
velocity_index = 0
data_serial_buffer = bytearray()
console_serial_buffer = bytearray()
note_key_presets = {index: "piano" for index in NOTE_KEY_INDICES}
last_applied_idempotency_key = None
last_applied_config_version = 0
protocol_capabilities = {
    "device": DEVICE_NAME,
    "protocolVersion": PROTOCOL_VERSION,
    "features": ["handshake", "apply_config"],
    "firmwareVersion": FIRMWARE_VERSION,
}

CHORD_INTERVALS_BY_NAME = {
    "maj": (0, 4, 7),
    "min": (0, 3, 7),
    "maj7": (0, 4, 7, 11),
    "min7": (0, 3, 7, 10),
    "maj9": (0, 4, 7, 14),
    "min9": (0, 3, 7, 14),
    "maj79": (0, 4, 7, 11, 14),
    "min79": (0, 3, 7, 10, 14),
}
modifier_chord_types = {
    15: "maj",
    14: "min",
    13: "maj7",
    12: "min7",
}


def set_led_scaled(index, red, green, blue):
    keybow.set_led(
        index,
        int(red * BRIGHTNESS_SCALE),
        int(green * BRIGHTNESS_SCALE),
        int(blue * BRIGHTNESS_SCALE),
    )


def oscillating_channel(time_value, phase, minimum=OSCILLATE_MIN, maximum=OSCILLATE_MAX):
    span = maximum - minimum
    return minimum + int(span * (math.sin(time_value + phase) + 1) / 2)


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


def note_color_for_key(index, time_value):
    preset = note_key_presets.get(index, "piano")

    if preset == "piano":
        if index in PIANO_BLACK_KEY_INDICES:
            return PIANO_BLACK_COLOR
        return PIANO_WHITE_COLOR

    phase = index * 0.65
    if preset == "aurora_scene":
        return (
            oscillating_channel(time_value * 1.2, phase + 0.0, 60, 180),
            oscillating_channel(time_value * 1.2, phase + 2.0, 120, 255),
            oscillating_channel(time_value * 1.2, phase + 4.0, 100, 240),
        )

    if preset == "sunset_scene":
        return (
            oscillating_channel(time_value * 0.9, phase + 0.2, 170, 255),
            oscillating_channel(time_value * 0.9, phase + 2.2, 70, 180),
            oscillating_channel(time_value * 0.9, phase + 4.2, 20, 120),
        )

    if preset == "ocean_scene":
        return (
            oscillating_channel(time_value, phase + 0.6, 20, 90),
            oscillating_channel(time_value, phase + 2.6, 80, 210),
            oscillating_channel(time_value, phase + 4.6, 150, 255),
        )

    return PIANO_WHITE_COLOR


def restore_note_led(index, time_value):
    set_led_scaled(index, *note_color_for_key(index, time_value))


def set_active_chord_notes(notes):
    previous_notes = list(active_chord_notes)
    active_chord_notes.clear()
    for note in notes:
        index = note_to_key_index(note)
        if index not in active_chord_notes:
            active_chord_notes.append(index)
    for index in previous_notes:
        if index not in active_chord_notes:
            restore_note_led(index, time.monotonic() * OSCILLATE_SPEED)


def clear_active_chord_notes():
    for index in active_chord_notes:
        restore_note_led(index, time.monotonic() * OSCILLATE_SPEED)
    active_chord_notes.clear()


def refresh_active_chord_notes():
    notes = []
    for note_list in active_notes.values():
        notes.extend(note_list)
    set_active_chord_notes(notes)


def modifier_inactive_color(time_value, index):
    return (
        oscillating_channel(time_value, 0.8 + index),
        oscillating_channel(time_value, 2.9 + index),
        oscillating_channel(time_value, 5.0 + index),
    )


def update_modifier_leds(time_value):
    if alt_mode_active:
        inactive = (70, 70, 70)
        up_color = ALT_ACTIVE_COLOR if keys[OCTAVE_UP_KEY_INDEX].pressed else inactive
        down_color = ALT_ACTIVE_COLOR if keys[OCTAVE_DOWN_KEY_INDEX].pressed else inactive
        exit_color = ALT_ACTIVE_COLOR if keys[ALT_TOGGLE_KEY_INDEX].pressed else inactive
        set_led_scaled(OCTAVE_UP_KEY_INDEX, *up_color)
        set_led_scaled(OCTAVE_DOWN_KEY_INDEX, *down_color)
        set_led_scaled(VELOCITY_KEY_INDEX, *VELOCITY_COLORS[velocity_index])
        set_led_scaled(ALT_TOGGLE_KEY_INDEX, *exit_color)
        return

    for index in MODIFIER_KEY_INDICES:
        set_led_scaled(index, *modifier_inactive_color(time_value, index))


def update_note_leds(time_value):
    for index in NOTE_KEY_INDICES:
        if index in active_chord_notes:
            continue
        restore_note_led(index, time_value)

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


def stream_connected(stream):
    if stream is None:
        return False
    return bool(getattr(stream, "connected", False))


def poll_serial_stream(stream, buffer):
    if not stream_connected(stream):
        return

    waiting = int(getattr(stream, "in_waiting", 0) or 0)
    chunk = b""
    if waiting:
        chunk = stream.read(waiting) or b""

    responses = process_serial_chunk(
        buffer,
        chunk,
        protocol_capabilities,
        protocol_now_ms(),
        handle_apply_config,
    )
    for response in responses:
        stream.write(response)


def apply_modifier_chords(chord_map):
    received_keys = set(chord_map.keys())
    if received_keys != EXPECTED_MODIFIER_KEY_STRINGS:
        return {
            "ok": False,
            "code": "invalid_modifier_key",
            "reason": "modifierChords must contain keys 12,13,14,15.",
            "retryable": False,
        }

    next_map = {}

    for key in MODIFIER_KEY_INDICES:
        chord_name = chord_map.get(str(key))
        if chord_name not in CHORD_INTERVALS_BY_NAME:
            return {
                "ok": False,
                "code": "invalid_chord",
                "reason": "Unsupported chord for modifier %s." % key,
                "retryable": False,
            }
        next_map[key] = chord_name

    modifier_chord_types.update(next_map)
    return {"ok": True}


def apply_note_presets(preset_map):
    received_keys = set(preset_map.keys())
    if received_keys != EXPECTED_NOTE_KEY_STRINGS:
        return {
            "ok": False,
            "code": "invalid_note_key",
            "reason": "noteKeyColorPresets must contain keys 0-11.",
            "retryable": False,
        }

    next_presets = {}

    for key in NOTE_KEY_INDICES:
        preset_id = preset_map.get(str(key))
        if preset_id not in NOTE_PRESET_IDS:
            return {
                "ok": False,
                "code": "invalid_preset",
                "reason": "Unsupported preset for note key %s." % key,
                "retryable": False,
            }
        next_presets[key] = preset_id

    note_key_presets.update(next_presets)
    return {"ok": True}


def run_config_received_animation():
    for index in SWEEP_ORDER:
        set_led_scaled(index, 40, 170, 255)
        time.sleep(0.02)

    for _ in range(2):
        for index in range(16):
            set_led_scaled(index, 70, 255, 140)
        time.sleep(0.05)
        update_note_leds(time.monotonic() * OSCILLATE_SPEED)
        time.sleep(0.04)

    update_note_leds(time.monotonic() * OSCILLATE_SPEED)


def handle_apply_config(payload):
    global last_applied_idempotency_key, last_applied_config_version

    idempotency_key = payload.get("idempotencyKey")
    config_version = payload.get("configVersion")

    if idempotency_key == last_applied_idempotency_key:
        return {"ok": True, "appliedConfigVersion": last_applied_config_version}

    chord_result = apply_modifier_chords(payload.get("modifierChords", {}))
    if not chord_result.get("ok"):
        return chord_result

    preset_result = apply_note_presets(payload.get("noteKeyColorPresets", {}))
    if not preset_result.get("ok"):
        return preset_result

    last_applied_idempotency_key = idempotency_key
    last_applied_config_version = config_version

    run_config_received_animation()

    return {"ok": True, "appliedConfigVersion": config_version}


def poll_serial():
    # Listen on both CDC channels so protocol works when either Data or Control
    # serial interface is selected by the host OS.
    poll_serial_stream(usb_cdc.data, data_serial_buffer)
    poll_serial_stream(getattr(usb_cdc, "console", None), console_serial_buffer)


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
    if last_alt_press_time and now - last_alt_press_time <= ALT_TOGGLE_WINDOW and not any_note_pressed():
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


for index in NOTE_KEY_INDICES:
    restore_note_led(index, time.monotonic() * OSCILLATE_SPEED)
for index in MODIFIER_KEY_INDICES:
    set_led_scaled(index, 0, 0, 0)

midi = adafruit_midi.MIDI(midi_out=usb_midi.ports[1], out_channel=0)

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
