# hx01 Firmware Deploy (Source of Truth)

`thxcmididevicecode/` is the single source of truth for firmware code, first-time bootstrap packaging, and direct-update packaging.

## Understand the three device states

1. `RP2350` / `RPI-RP2` / blank init drive with `INFO_UF2.TXT`
   This is the Raspberry Pi ROM UF2 bootloader, not a CircuitPython filesystem and not a running hx01 device.
2. `CIRCUITPY`
   This is the CircuitPython filesystem used for first-time bootstrap provisioning and recovery.
3. Running hx01 device
   After `boot.py` runs, USB storage is intentionally hidden and the board should enumerate as hx01 serial/MIDI instead of keeping `CIRCUITPY` mounted.

Copying the `thxcmididevicecode/` folder onto the blank UF2 bootloader drive will not work. The UF2 drive only accepts a CircuitPython `.uf2` runtime image.

## First-time bootstrap for blank Pico / Pico 2 boards

If the board mounts as a UF2 bootloader drive with `INFO_UF2.TXT`, install CircuitPython first:

- Pico / RP2040: <https://circuitpython.org/board/raspberry_pi_pico/>
- Pico W / RP2040: <https://circuitpython.org/board/raspberry_pi_pico_w/>
- Pico 2 / RP2350: <https://circuitpython.org/board/raspberry_pi_pico2/>
- Pico 2 W / RP2350: <https://circuitpython.org/board/raspberry_pi_pico2_w/>

After CircuitPython is installed and the board remounts as `CIRCUITPY`, provision the full hx01 filesystem from the repository root:

```bash
npm run build:firmware-bootstrap
npm run deploy:firmware-bootstrap -- --drive E:
```

For RP2350 boards, pass the exact board when starting from the UF2 bootloader so the correct CircuitPython image is selected:

```bash
npm run deploy:firmware-bootstrap -- --drive E: --board pico2
npm run deploy:firmware-bootstrap -- --drive E: --board pico2_w
```

If CircuitPython installs successfully but the board still never remounts `CIRCUITPY`, the old
filesystem is usually still running a `boot.py` that hides USB storage. On Windows, rerun the same
command with the active console port so the deploy script can erase that stale filesystem and wait
for a clean remount automatically:

```bash
npm run deploy:firmware-bootstrap -- --drive E: --board pico2 --console-port COM7
```

This creates and deploys a staged artifact at:

- `dist/hx01-firmware-<version>-bootstrap/`

The bootstrap artifact contains the complete hx01 CircuitPython payload:

- `boot.py`
- `code.py`
- `protocol_v1.py`
- `settings.toml` when present
- `lib/**/*`

The deploy script only copies managed hx01 files and does not delete unrelated files already on `CIRCUITPY`.

## Direct Update Me package for already-provisioned devices

From repository root:

```bash
npm run build:firmware-package
```

This creates:

- `dist/hx01-firmware-<version>-direct.json`

The direct package is a `DeviceFirmwarePackage` payload used by website "Update Me" direct flash on an already-running hx01 device. It does not provision a blank board and it does not install the vendored `lib/` tree.

## Publish package + manifest to R2

From repository root:

```bash
npm run publish:firmware-update -- --artifact dist/hx01-firmware-<version>-direct.json
```

Publish behavior:

- Uploads package to `updates/` in R2.
- Upserts the version in `updates/firmware-manifest.json`.
- Removes legacy `manual_bridge` manifest entries.
- Marks this release as `direct_flash`.

## Optional direct serial flashing (manual recovery for running CircuitPython)

1. Confirm serial device path (example: `/dev/cu.usbmodem101`).
2. Upload files in this order:

```bash
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 put thxcmididevicecode/protocol_v1.py /protocol_v1.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 put thxcmididevicecode/code.py /code.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 put thxcmididevicecode/boot.py /boot.py
$HOME/Library/Python/3.14/bin/ampy --port /dev/cu.usbmodem101 reset
```

## Success and recovery expectations

- After a successful bootstrap deploy and reboot, `CIRCUITPY` disappearing is expected because `boot.py` disables USB storage on normal boots.
- A healthy device should reappear as hx01 serial/MIDI and respond to the website direct-update flow.
- For future firmware releases, prefer the website "Update Me" flow or the direct package tooling.
- If you need to recover a blank or broken device, re-enter the Pico bootloader with `BOOTSEL` so the UF2 drive returns, then reinstall CircuitPython and rerun `deploy:firmware-bootstrap`.
