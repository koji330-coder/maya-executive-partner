# Progress

## Current phase

Phase 1 — Character Runtime: complete.

## Completed

### Phase 0 — Repo bootstrap

- Expo SDK 57 / React Native 0.86 / React 19 / TypeScript app, iOS-first, buildable through EAS (no native modules beyond Expo first-party packages).
- expo-router navigation shell with the four-tab bottom navigation from `docs/UX_SPEC.md` (Today / Talk / Decisions / Company) plus a Settings modal.
- `npm run typecheck` (strict, plus `noUncheckedIndexedAccess`), `npm run lint` (eslint-config-expo), `npm test` (jest-expo). `npm run check` runs all three.
- Environment config through `EXPO_PUBLIC_*` variables, surfaced on the Settings screen. No provider keys in the app.
- Local SQLite bootstrap: `src/services/storage/` opens `maya.db`, applies versioned migrations tracked with `PRAGMA user_version`, and creates the five cache tables from `docs/DATA_MODEL.md`.

### Phase 1 — Character Runtime

- `CharacterStateMachine` — emotion / activity / pose / scene / isSpeaking, with `beginThinking`, `applyResponse`, `cancelThinking`, `beginSpeaking`, `endSpeaking`. Plain TypeScript, no React, no timers.
- `BlinkController` — randomized 3–7s interval, open → half → closed → half → open over 250–350ms, occasional double blink. Timer and random source are injectable.
- `BreathingController` — a ~3.6s breath (scaleY 1.000 → 1.006) and a ~7.4s idle drift, both on the native driver.
- `LipSyncController` — amplitude buckets to `closed | small | open`, with a hold window that stops per-frame flutter. Implements `LipSyncEngine` so a viseme engine can replace it without touching the renderer.
- `CharacterStage` — the scene MAYA inhabits, including the "考えています…" state (three fading dots, not a spinner).
- `PlaceholderMaya` — layered shapes standing in for the generated artwork, driven by exactly the state the real layers will consume.
- `DevExpressionControls` — Phase 1 control surface for expression, pose, scene, activity and clip playback. Gated behind `__DEV__`.
- Audio abstraction — `AudioEngine` interface, fixed-clip manifest for the six OmniVoice lines, and `EnvelopeAudioEngine`, which plays a clip's amplitude envelope so lip sync is exercisable before any audio file exists.

## Verification

- 32 unit tests pass (state machine, blink timing, lip sync thresholds, clip manifest, audio lifecycle, Today greeting).
- Typecheck and lint are clean.
- `npx expo export --platform ios` bundles successfully (1183 modules).
- The app was run in a browser and checked visually: character renders, blinking runs, expression/pose/scene controls drive the character, the thinking caption appears, and the mouth opens during clip playback. The developer controls are absent from an export build, as `docs/ACCEPTANCE_CRITERIA.md` requires.

## Known issues and limitations

- The character is a placeholder built from plain views. It is deliberately crude; the generated MAYA layers from `docs/ASSET_PIPELINE.md` are not in the repo yet.
- No audio actually plays. `EnvelopeAudioEngine` drives lip sync from an amplitude envelope with no sound. Phase 6 swaps in an expo-audio implementation once the OmniVoice renders exist.
- Lip sync reads a shipped amplitude envelope rather than the live audio stream. React Native cannot read PCM from a playing file without a heavy native dependency, so the amplitude track has to ship alongside each clip.
- The composer on the Talk screen is present but disabled. Sending is wired up in Phase 2.
- SQLite is not enabled for the web target. The web build exists for fast layout iteration only and reports the local cache as unavailable.
- Only the settings key-value repository is implemented. The company / conversation / message / decision tables exist but have no repositories yet.
- Animation was verified in a browser, not on an iPhone. The 60fps target in `docs/ACCEPTANCE_CRITERIA.md` is unverified on device.

## Next

- Phase 2 — Local conversation prototype: chat composer, mocked `MayaResponse` payloads, visual state driven by response JSON, Decisions UI with local mocked records.
