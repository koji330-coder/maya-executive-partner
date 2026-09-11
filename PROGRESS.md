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

## Image asset requirements — confirmed

Settled before any generation, and written into `docs/ASSET_PIPELINE.md` and
`docs/IMAGE_GENERATION_GUIDE.md`.

- **Composition**: MAYA is a transparent cut-out; the five scenes are separate background plates. Baking backgrounds into expressions would turn emotion and scene into a cross product.
- **Expressions**: nine generated cut-outs matching `MayaEmotion`. `wink` is rendered from the eye frames and needs no image.
- **Animation**: eye frames for every expression, mouth frames for `neutral`, `smile`, `serious` and `challenge` only, since voice is used selectively.
- **Pose**: generated artwork for `default` only in v0.1. The union and the response contract are unchanged; the asset resolver falls back.
- **References**: the design sheet is not fed to the generator because its baked text bleeds into output. Three text-free crops were cut from it for that purpose.

Generation counts: 9 cut-outs and 5 plates generated, 27 eye frames and 12 mouth
frames derived.

## Next

- Reference image rebuild. The crops taken from the design sheet are too coarse to lock identity for production generation: the face is 287x412 and each expression panel is about 130px wide. The design sheet also has hands on the cheek in every panel and hair crossing the eyes, neither of which survives cut-out and eye-frame derivation. `docs/REFERENCE_IMAGE_REQUEST.md` is the request for a purpose-built replacement set, and `assets/reference/maya-safe-zone-diagram.png` is its spec attachment: the eye and mouth regions the derivation step replaces, marked on the current reference. The constraint is local to those two regions so the artwork keeps its richness everywhere else.
- Image asset production, starting with the `emotion_neutral` master. Blocked on the reference rebuild.
- Phase 2 — Local conversation prototype: chat composer, mocked `MayaResponse` payloads, visual state driven by response JSON, Decisions UI with local mocked records.
