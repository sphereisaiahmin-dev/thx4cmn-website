import json
import math
import time

time.sleep(5)

from keybow2040 import Keybow2040
# from keybow_hardware.pim56x import PIM56X as Hardware # for Keybow 2040
from keybow_hardware.pim551 import PIM551 as Hardware  # for Pico RGB Keypad Base

import usb_midi
import usb_cdc
import adafruit_midi
from adafruit_midi.note_off import NoteOff
from adafruit_midi.note_on import NoteOn

keybow = Keybow2040(Hardware())
keys = keybow.keys

BRIGHTNESS_SCALE = 0.9

NOTE_KEY_INDICES = tuple(range(12))
MODIFIER_KEY_INDICES = (12, 13, 14, 15)
ALT_TOGGLE_KEY_INDEX = 12
VELOCITY_KEY_INDEX = 13
OCTAVE_DOWN_KEY_INDEX = 14
OCTAVE_UP_KEY_INDEX = 15

OSCILLATE_MIN = 10
OSCILLATE_MAX = 140
OSCILLATE_SPEED = 2.2
BASE_NOTE_WHITE = 150
base_note_color = [BASE_NOTE_WHITE, BASE_NOTE_WHITE, BASE_NOTE_WHITE]
ALT_ACTIVE_COLOR = (0, 0, 255)

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
MAX_CHORD_INTERVAL = 11
EMERGENCY_NOTE_MIN = min(BASE_NOTES) + BASE_NOTE_OFFSET + MIN_OCTAVE_OFFSET
EMERGENCY_NOTE_MAX = (
    max(BASE_NOTES) + BASE_NOTE_OFFSET + MAX_OCTAVE_OFFSET + MAX_CHORD_INTERVAL
)
EMERGENCY_NOTE_RANGE = range(EMERGENCY_NOTE_MIN, EMERGENCY_NOTE_MAX + 1)

active_chord_notes = []
active_notes = {}
last_alt_press_time = None
alt_mode_active = False
octave_offset = 0
velocity_index = 0
serial_buffer = bytearray()

CHORD_INTERVALS_BY_NAME = {
    "maj": (0, 4, 7),
    "min": (0, 3, 7),
    "maj7": (0, 4, 11),
    "min7": (0, 3, 10),
    "maj9": (0, 4, 7, 11, 14),
    "min9": (0, 3, 7, 10, 14),
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


def set_active_chord_notes(notes):
    previous_notes = list(active_chord_notes)
    active_chord_notes.clear()
    for note in notes:
        index = note_to_key_index(note)
        if index not in active_chord_notes:
            active_chord_notes.append(index)
    for index in previous_notes:
        if index not in active_chord_notes:
            set_led_scaled(index, *base_note_color)


def clear_active_chord_notes():
    for index in active_chord_notes:
        set_led_scaled(index, *base_note_color)
    active_chord_notes.clear()


def refresh_active_chord_notes():
    notes = []
    for note_list in active_notes.values():
        notes.extend(note_list)
    set_active_chord_notes(notes)


def update_modifier_leds(time_value):
    alt_inactive_color = tuple(base_note_color)
    if alt_mode_active:
        up_color = (
            ALT_ACTIVE_COLOR if keys[OCTAVE_UP_KEY_INDEX].pressed else alt_inactive_color
        )
        down_color = (
            ALT_ACTIVE_COLOR if keys[OCTAVE_DOWN_KEY_INDEX].pressed else alt_inactive_color
        )
        exit_color = (
            ALT_ACTIVE_COLOR if keys[ALT_TOGGLE_KEY_INDEX].pressed else alt_inactive_color
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


def clamp_color_value(value):
    return max(0, min(255, int(value)))


def set_base_note_color(color_values):
    for i, value in enumerate(color_values[:3]):
        base_note_color[i] = clamp_color_value(value)
    for index in NOTE_KEY_INDICES:
        if index not in active_chord_notes:
            set_led_scaled(index, *base_note_color)


def update_modifier_chord_types(chord_map):
    for key, chord_name in chord_map.items():
        try:
            index = int(key)
        except (TypeError, ValueError):
            continue
        if index in MODIFIER_KEY_INDICES and chord_name in CHORD_INTERVALS_BY_NAME:
            modifier_chord_types[index] = chord_name


def handle_serial_message(message):
    if not message:
        return
    if message == "ping":
        usb_cdc.data.write(b"pong\n")
        return
    if message == "state":
        state_payload = {
            "baseColor": list(base_note_color),
            "chords": {str(key): value for key, value in modifier_chord_types.items()},
        }
        usb_cdc.data.write((json.dumps(state_payload) + "\n").encode("utf-8"))
        return
    try:
        payload = json.loads(message)
    except ValueError:
        return
    if not isinstance(payload, dict):
        return
    chord_map = payload.get("chords")
    if isinstance(chord_map, dict):
        update_modifier_chord_types(chord_map)
    base_color = payload.get("baseColor")
    if isinstance(base_color, (list, tuple)) and len(base_color) >= 3:
        set_base_note_color(base_color)
    usb_cdc.data.write(b"ok\n")


def poll_serial():
    if usb_cdc.data is None or not usb_cdc.data.connected:
        return
    waiting = usb_cdc.data.in_waiting
    if waiting:
        serial_buffer.extend(usb_cdc.data.read(waiting))
    if serial_buffer == b"ping":
        serial_buffer.clear()
        handle_serial_message("ping")
        return
    while b"\n" in serial_buffer or b"\r" in serial_buffer:
        for separator in (b"\n", b"\r"):
            if separator in serial_buffer:
                line, _, remainder = serial_buffer.partition(separator)
                serial_buffer.clear()
                serial_buffer.extend(remainder)
                break
        else:
            break
        handle_serial_message(line.decode("utf-8").strip())


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
    global octave_offset, velocity_index
    if not alt_mode_active:
        return
    if index == OCTAVE_UP_KEY_INDEX:
        adjust_octave_offset(12)
    elif index == OCTAVE_DOWN_KEY_INDEX:
        adjust_octave_offset(-12)
    elif index == VELOCITY_KEY_INDEX:
        velocity_index = (velocity_index + 1) % len(VELOCITY_LEVELS)


for index in NOTE_KEY_INDICES:
    set_led_scaled(index, *base_note_color)
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
