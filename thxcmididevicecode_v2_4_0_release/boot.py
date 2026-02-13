import storage
import usb_cdc

try:
    storage.disable_usb_drive()
except Exception:
    # Some boots may prevent USB drive toggling (safe mode / unsupported runtime).
    pass

try:
    import supervisor

    supervisor.set_usb_identification(product="thx-c")
except Exception:
    # Older CircuitPython builds may not expose USB identification controls.
    pass

# Expose a single serial CDC channel for Web Serial + ampy compatibility.
usb_cdc.enable(console=True, data=False)
