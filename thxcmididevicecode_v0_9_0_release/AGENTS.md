# AGENTS.md

## Project overview
This repository contains CircuitPython firmware for a Raspberry Pi Pico paired with the Pimoroni RGB Keypad Base (a 4x4 keypad with per-key RGB LEDs). The device acts as a USB MIDI controller that outputs single notes or chords depending on modifier keys held on the top row. The runtime entrypoint is `code.py`, which CircuitPython executes on boot. This repo also vendors the Pimoroni Keybow hardware abstraction and Adafruit MIDI libraries under `lib/`.

## Hardware + runtime
- **Target hardware:** Raspberry Pi Pico + Pimoroni RGB Keypad Base (PIM551). The code includes a commented alternative for Keybow 2040 (PIM56X).
- **Runtime:** CircuitPython; `code.py` is executed by the interpreter.
- **MIDI:** USB MIDI via `usb_midi.ports[1]` (out channel 0).

## UX / interaction model
- **Key layout:** 16 keys indexed `0-15` by the Keybow library. The code treats keys `12-15` (top row) as chord-mode modifiers.
- **Chord modes (hold modifier + press note):**
  - No modifier: single notes.
  - Key `15` held: major triads.
  - Key `14` held: minor triads.
  - Key `13` held: major 7th chords.
  - Key `12` held: minor 7th chords.
- **Emergency note-off:** Releasing any modifier key (12–15) sends NoteOff for a wide note range (60–86) to prevent hanging notes.
- **LEDs:** `code.py` assigns static RGB colors per key on startup to communicate layout/modes. Adjusting LED colors is the primary visual UX tweak.

## Codebase structure
- **`code.py`**
  - Initializes Keybow hardware and LED colors.
  - Registers `on_press`/`on_release` handlers for each key in each chord mode.
  - Sends `NoteOn`/`NoteOff` over USB MIDI.
  - Contains duplicated single-note mapping blocks (look for two identical “Single note” sections). Consider refactoring into helper functions if extending.
- **`lib/`**
  - **`keybow2040.py` / `keybow_hardware/`**: Pimoroni Keybow library for key scanning and LED control.
  - **`adafruit_midi/`**: Adafruit MIDI message classes (NoteOn/NoteOff, etc.).

## MIDI mapping conventions
- **Base notes:** C4–B4 (MIDI 60–71) for keys 0–11.
- **Chords:** Built by adding scale tones (e.g., major: +4 +7; minor: +3 +7; maj7: +4 +11; min7: +3 +10).
- **Velocity:** Fixed at 127 for NoteOn; NoteOff uses velocity 0.

## Common tasks for future agents
- **Add new chord types:** Follow the existing pattern of modifier-key conditionals; consider consolidating note/chord generation in helper functions to avoid repeated handlers.
- **Add octave shift:** Add a global `base_note` offset and map keys 12–15 to shift up/down instead of chord mode, or use long-press to toggle.
- **Improve UX feedback:** Use LEDs to indicate active chord mode (e.g., highlight modifier key while held).
- **Prevent handler redefinition:** `on_press`/`on_release` handlers are registered inside the `while True` loop, which can lead to repeated registrations. Moving handler setup outside the loop and using state checks for modifier keys would be a safer architecture.

## Testing and deployment notes
- This is hardware-dependent; functional testing requires a Pico running CircuitPython connected over USB MIDI.
- For local linting, treat `code.py` as CircuitPython-style code (no standard CPython stubs for hardware libraries).

## Files to reference when editing
- `code.py`: Main behavior, MIDI mapping, and LED colors.
- `lib/keybow2040.py` and `lib/keybow_hardware/`: Key scanning/LED interface.
- `lib/adafruit_midi/`: MIDI message definitions.
