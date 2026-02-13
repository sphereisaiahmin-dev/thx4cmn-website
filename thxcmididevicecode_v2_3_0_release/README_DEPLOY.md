# thx.c Firmware v2.3.0 Release

This folder is a standalone firmware package for the Pico MIDI device.

## Included files
- `boot.py` (USB product name, hides `CIRCUITPY`, enables one CDC serial channel)
- `code.py` (firmware runtime, protocol handlers, LED/config logic)
- `protocol_v1.py` (NDJSON protocol parser/dispatcher)
- `lib/` (required CircuitPython dependencies)
- `settings.toml`

## Serial-first deploy (`ampy`)
Use serial deploy as the default update path.

1. Confirm the board serial device path (`/dev/cu.usbmodem*`).
2. Upload files in this order:

```bash
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem114301 put thxcmididevicecode_v2_3_0_release/protocol_v1.py /protocol_v1.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem114301 put thxcmididevicecode_v2_3_0_release/code.py /code.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem114301 put thxcmididevicecode_v2_3_0_release/boot.py /boot.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem114301 reset
```

3. Replug/reset the board.
4. Verify only one `thx.c - connection` serial port is visible.

## Optional mass-storage deploy
This firmware hides `CIRCUITPY` on normal boot (`storage.disable_usb_drive()`), so mass-storage copy may not be available unless booted in a mode that exposes the drive.
