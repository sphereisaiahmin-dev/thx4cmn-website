import usb_cdc

try:
    import supervisor

    supervisor.set_usb_identification(product="thx.c - connection")
except Exception:
    # Older CircuitPython builds may not expose USB identification controls.
    pass

# Keep both channels enabled for robust WebSerial operation.
usb_cdc.enable(console=True, data=True)
