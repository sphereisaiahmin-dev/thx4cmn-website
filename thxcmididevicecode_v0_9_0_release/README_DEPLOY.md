# thx-c Firmware v0.9.0 Release

This folder is a standalone firmware package for the Pico MIDI device.

## Included files
- `boot.py` (USB product name, hides `CIRCUITPY`, enables one CDC serial channel)
- `code.py` (firmware runtime, protocol handlers, LED/config logic)
- `protocol_v1.py` (NDJSON protocol parser/dispatcher)
- `lib/` (required CircuitPython dependencies)
- `settings.toml`

## Serial-first deploy (`ampy`)
Use serial deploy as the default update path.

1. Confirm the board serial device path (for example `/dev/cu.usbmodem101`).
2. Upload files in this order:

```bash
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 put thxcmididevicecode_v0_9_0_release/protocol_v1.py /protocol_v1.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 put thxcmididevicecode_v0_9_0_release/code.py /code.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 put thxcmididevicecode_v0_9_0_release/boot.py /boot.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 reset
```

3. Replug/reset the board.
4. Verify only one `thx-c` serial port is visible.
