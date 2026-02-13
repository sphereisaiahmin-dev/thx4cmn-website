# thx-c Firmware v2.1.0 Release

This folder is a standalone firmware package for the Pico MIDI device.

## Included files
- `boot.py` (enables `usb_cdc` console + data channels)
- `code.py` (firmware runtime, protocol handlers, LED/config logic)
- `protocol_v1.py` (NDJSON protocol parser/dispatcher)
- `lib/` (required CircuitPython dependencies)
- `settings.toml`

## Deploy (CIRCUITPY mass storage)
1. Mount your board as `CIRCUITPY`.
2. Copy these files/folders to the root of `CIRCUITPY`:
   - `boot.py`
   - `code.py`
   - `protocol_v1.py`
   - `settings.toml`
   - `lib/` (merge/replace existing library files)
3. Safely eject and reconnect/reboot the board.

## Deploy (serial fallback with ampy)
If `CIRCUITPY` mass storage is not mounting, use serial upload:

```bash
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem114301 put thxcmididevicecode_v2_1_0_release/boot.py /boot.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem114301 put thxcmididevicecode_v2_1_0_release/protocol_v1.py /protocol_v1.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem114301 put thxcmididevicecode_v2_1_0_release/code.py /code.py
```

After upload, reset/replug the device before host-side tests.
