# Legacy Tone.js reference notes (archival)

`audiowebplayer/webplayerscript.js` is kept as historical context only.
Modern runtime behavior must live in the React/WebAudio implementation.

Concise behavioral references we intentionally preserve:
- Reverse should flip direction from the current playhead moment (no track reload).
- Prev/next should reset transient DSP state (rpm and reverse) before loading the next track.
- RPM speed control should remain centered at `1.0x` with slower/faster ranges around center.

Legacy issues to **avoid copying**:
- Duplicate speed handlers (`speedCtl.oninput` appears multiple times with conflicting formulas).
- Mixed state ownership between DOM flags and player internals.
- Reload/dispose-heavy direction changes.
