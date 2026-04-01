import storage
import usb_cdc
import usb_midi

try:
    storage.disable_usb_drive()
except Exception:
    # Some boots may prevent USB drive toggling (safe mode / unsupported runtime).
    pass

try:
    import supervisor

    supervisor.set_usb_identification(manufacturer="thx4cmn", product="hx01")
except Exception:
    # Older CircuitPython builds may not expose USB identification controls.
    pass

try:
    usb_midi.set_names(
        streaming_interface_name="hx01",
        audio_control_interface_name="hx01",
        in_jack_name="hx01",
        out_jack_name="hx01",
    )
except Exception:
    # Older CircuitPython builds may not expose USB MIDI naming controls.
    pass

# Expose a single serial CDC channel for Web Serial + ampy compatibility.
usb_cdc.enable(console=True, data=False)
