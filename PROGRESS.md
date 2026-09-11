# Progress

## Current phase

Phase 1 — Character Runtime: complete, now running on generated artwork for two expressions. Phase 2 is next.

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
- `MayaArtwork` and `expressionAssets` — the generated artwork, shipped as four pre-composited frames per expression. The stage picks the artwork when the current emotion has it and the placeholder when it does not, so the backend can already return any emotion from the response contract.
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

## Review tooling

`tools/motion-bench/` holds the frame review bench, published at
`https://claude.ai/code/artifact/09659d87-a4af-4599-aaba-8b0c3193c7e3`. It plays
the generated frames on the implementation's own blink schedule and lip sync
thresholds, so a variant can be judged before it reaches the app.

It is manifest-driven: adding a pose is two generated images, a measured mask set
and one object in `POSES`. The bench keeps its URL across updates; publishing
without that URL makes a second, orphaned page. Steps are in the tool's README.

The page's envelope, hold window and blink timing are copies of the implementation's.
Changing `clipManifest.ts`, `LipSyncController.ts` or `BlinkController.ts` means
changing the bench too, or the preview stops predicting the app.

## Blocked on the pipeline move

The pipeline lives on one machine, so neither a cloud session nor another
computer can generate. `docs/PIPELINE_PORTABILITY.md` is the move: push it to
`character-motion-studio`, then supply an API key through the environment.

The endpoint is reachable from this container — an unkeyed call returns Google's
own PERMISSION_DENIED, not a proxy block — so only the key and the code are
missing. Once both land, generation and measurement run in one loop here instead
of a round trip through a person for every attempt.

What that buys is attempts per unit of the user's time, not a better model. The
separate win is dropping GPT for the proven `edit` path: the locked-parent method
was established there, and the drift measured on `challenge` may simply be the
cost of working off-recipe.

## Next

- Reference image rebuild. The crops taken from the design sheet are too coarse to lock identity for production generation: the face is 287x412 and each expression panel is about 130px wide. The design sheet also has hands on the cheek in every panel and hair crossing the eyes, neither of which survives cut-out and eye-frame derivation. `docs/REFERENCE_IMAGE_REQUEST.md` is the request for a purpose-built replacement set, and `assets/reference/maya-safe-zone-diagram.png` is its spec attachment: the eye and mouth regions the derivation step replaces, marked on the current reference. The constraint is local to those two regions so the artwork keeps its richness everywhere else.
- Re-run `challenge`. There is no compositing fallback: alignment plus a face mask
  was tested on the first attempt and fails, because the face's proportions changed
  and no similarity transform registers the eyes and the mouth at once. The prompt
  has to hold the geometry. `tools/measure_drift.py` is the gate, validated against
  the known-good blink and mouth pairs and the known-bad first attempt. The first attempt did not hold registration: best fit needs
  scale 0.90 and dy +68px, so the head came out about 11% larger and lower, and the
  brows and bangs changed with it. Masked compositing cannot rescue this the way it
  rescues blink and mouth, because an expression replaces the whole cut-out. The
  prompt needs the same granularity the proven pipeline uses on blinks: name what
  stays fixed, then change one thing. Correction request and measurements are in
  `assets/reference/candidates/`. 26 generations still ride on this answer.
- The 3/4 view and the full-body shot from the reference request are deferred, not
  dropped. Pose collapses to `default` in v0.1, so neither is used, and the
  locked-parent method removed their identity-checking job.

### Production pipeline — found

The existing Nano Banana pipeline is on this machine at
`クロノIT-動画制作リサーチ/nano-banana`, proven on a teacher-and-student explainer
video. `docs/NANO_BANANA_PIPELINE.md` records its interface and its operating
lessons. `npm.cmd run doctor` passes here.

It changes how frames are made. Variants are generated by handing the accepted
expression back to the model as a locked parent with a one-change instruction,
not derived geometrically. Registration comes from compositing the variant
through a small elliptical mask over the eyes or the mouth, so drift outside the
ellipse never reaches the screen. Masks are measured from the closed/open pixel
diff, held per state, and sized larger than the measured extent.

**The method is proven on MAYA's own style.** A blink and an open mouth were
generated from the accepted master and composited through measured ellipse masks.
Both read cleanly with no seam. The composition did not drift: the best aligning
translation between master and variant was zero, and the pixel difference was
confined to the eyes. Results and the measured masks are in
`assets/reference/pipeline-test/`. The API 403 recorded on 2026-09-05 is gone.

**Correction, 2026-09-11.** An earlier pass treated a new expression as broken
when it did not register against the neutral master. That was wrong. Expressions
carry their own master; blink and mouth frames are generated from that master and
composited through masks measured on that pair. The rejected `challenge` candidate
was re-tested this way and passed (scale 1.00, dx 0, dy +3), compositing as
cleanly as neutral did. Cross-master drift only affects the instant the emotion
changes, and is absorbed by a per-master alignment transform rather than by
discarding artwork. `challenge-01` is still going back, but only because the
expression is not challenge, the eyebrows thickened, and the bangs moved.

**In the app, 2026-09-11.** `neutral` and `challenge` are wired in and render on the
Talk screen with blinking, breathing and lip sync. Verified in a browser at phone
size with no console errors. Three things were settled by doing it:

- Frames are pre-composited at build time and the app just swaps between four
  images per expression. Compositing through the ellipse masks at runtime would
  need canvas work in React Native for no visible gain.
- All four frames stay mounted and toggle by opacity. Swapping a single `Image`
  source flickers on the first change.
- The cut-out needs a knee on the alpha ramp. Scaling straight from zero turned
  a point or two of background noise into alpha 10-27 across the whole plate,
  which showed up in the app as a grey rectangle behind her.

**Confirmed on an iPhone, 2026-09-11.** Loaded through Expo Go over the LAN.
WebP decodes for bundled images on iOS, which was the one unverified risk in
shipping the artwork as WebP. Blinking runs correctly in the device renderer.
`expo-doctor` passes 21/21 after adding the missing `expo-font` peer, moving
`splash` into the `expo-splash-screen` plugin, and dropping `newArchEnabled`.

There is no EAS development build for this project yet, so the usual
build-once-then-live-reload workflow is not available. Expo Go covers it while
the app stays inside the SDK; a development build becomes necessary when Live2D
or real-time TTS arrive.

The placeholder is kept as the fallback for the eight expressions without
artwork, deliberately. It marks at a glance which expressions are still missing.

The three-valued runtime states collapse onto the two-valued artwork: `half` maps
to the open eye, which keeps the blink around 125ms closed instead of 250ms, and
`small` maps to the open mouth. The lip sync thresholds are set equal so the
controller emits two states.

One decision remains before the full run: whether to switch the generation
background from mid grey to the pure white that `rembg/isnet-anime` expects. Two
mouth and two eye states are settled, matching the proven pipeline; the three
valued types stay and the asset resolver maps `small` and `half` to the nearest
available frame.

### Reference rebuild — done

The front neutral master is accepted and is now
`assets/reference/maya-face-reference.png`, replacing the 287x412 crop. Candidate
history is in `assets/reference/candidates/`.

Two things were settled along the way.

**The cut-out plus scene-plate model is confirmed on real output.** Alpha keyed
off the flat background and composited over a warm plate keeps fine flyaway
strands with no grey halo, so the hair needs no simplification. Future requests
should keep asking for a flat background rather than for simpler hair.

**The safe zone became two tiers.** The first draft put the eyebrows in the same
absolute zone as the eyes, which would have forced a change to MAYA's bangs. A
blink does not move the eyebrow, so hair across a brow never fights the
animation; the brow only has to stay readable, because it is what carries
`challenge`, `annoyed` and `concerned`. The eyes and mouth stay absolute. The spec
was relaxed instead of the hairstyle.
- Phase 2 — Local conversation prototype: chat composer, mocked `MayaResponse` payloads, visual state driven by response JSON, Decisions UI with local mocked records.
