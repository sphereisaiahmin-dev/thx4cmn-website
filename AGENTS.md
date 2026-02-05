# Web player maintenance notes

## Regression found
- Reverse toggle caused track reload loops (`Loading track...`) because `loadTrack` depended on `state.isReversed`, and track-loading `useEffect` depended on `loadTrack` identity.

## Anti-patterns to avoid
- Do not include transient transport direction state in `loadTrack` callback dependencies.
- Do not implement reverse by reloading or re-decoding tracks.
- Do not copy legacy duplicate handlers from `audiowebplayer/webplayerscript.js` (especially duplicate `speedCtl.oninput` definitions).
- Do not couple UI-only state toggles to network/list fetch paths.

## Working parts to preserve
- play/pause behavior (including autoplay carry-over on prev/next).
- next/prev wrapping and DSP reset semantics.
- shuffled initial playlist order.
- rpm slider mapping/range (`0.35x` to `2.35x`, centered at `1.0x`).
- reverse continuity from current playhead without jump.

## Quick QA checklist
- Load first track and press play/pause multiple times.
- Toggle reverse while playing and while paused; verify no `Loading track...` status on reverse-only clicks.
- After reverse is enabled, use next/prev and ensure controls still function.
- Confirm shuffle returns tracks in non-source order on list fetch.
- Move rpm slider across full range and verify displayed multiplier updates.
