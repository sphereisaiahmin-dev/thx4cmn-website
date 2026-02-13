# thx-c Firmware Deploy (Source of Truth)

`thxcmididevicecode/` is the single source of truth for firmware code and release packaging.

## Build direct Update Me package

From repository root:

```bash
npm run build:firmware-package
```

This creates:

- `dist/thx-c-firmware-<version>-direct.json`

The package is a `DeviceFirmwarePackage` payload used by website "Update Me" direct flash.

## Publish package + manifest to R2

From repository root:

```bash
npm run publish:firmware-update -- --artifact dist/thx-c-firmware-<version>-direct.json
```

Publish behavior:

- Uploads package to `updates/` in R2.
- Upserts the version in `updates/firmware-manifest.json`.
- Removes legacy `manual_bridge` manifest entries.
- Marks this release as `direct_flash`.

## Optional direct serial flashing (manual)

1. Confirm serial device path (example: `/dev/cu.usbmodem101`).
2. Upload files in this order:

```bash
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 put thxcmididevicecode/protocol_v1.py /protocol_v1.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 put thxcmididevicecode/code.py /code.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 put thxcmididevicecode/boot.py /boot.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 reset
```
