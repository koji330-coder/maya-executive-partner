# Progress

## Current phase

Phase 5 — Decisions: complete in code, not yet tried on a device. Phase 6 (voice) is postponed by decision; see docs/ASSET_BACKLOG.md.

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

### Phase 2 — Local conversation prototype

- `mayaResponse.ts` — the contract from `docs/AI_RESPONSE_CONTRACT.md` as types plus a validator. Only a missing `message` is fatal; everything else has a defensible default, so a model that gets one enum wrong still produces a usable turn. Repairs come back as warnings rather than errors, and Phase 3 decides what to do with them.
- `mockResponder.ts` — scripted replies written as untrusted payloads and pushed through that same validator, so the path the app runs now is the path it keeps. The set covers what is awkward to provoke from a live model: a flat refusal, a detected decision, an off-contract reply the validator has to repair, and a failure.
- `useConversation.ts` — the send path. Thinking starts before anything async, a duplicate send while waiting is refused, and a failure returns the typed text so a retry costs nothing.
- `MayaAnswer.tsx` — the reply laid out as `docs/UX_SPEC.md` §3 asks: statement, reasoning, options with one recommended, next action, decision card. Not a stack of bubbles.
- Decisions screen renders mocked records shaped like the `decisions` table.

The contract gained an `options` field. `docs/UX_SPEC.md` asks the Talk screen to
show options and `docs/PRODUCT_REQUIREMENTS.md` §6 makes proposing two or three
and recommending one part of the advisor protocol, but the contract had nowhere
to put them, so they would have had to hide inside the prose.

Mock script order is intent before topic: 「値下げはやめると決めた」 is a decision,
not another pricing question. Caught by a test, not by reading.

### Phase 3 — LLM integration

Gemini `gemini-3.8-flash`, called with the user's own key, structured output
against the response contract, and the Phase 2 validator on everything that comes
back. `docs/LLM_INTEGRATION.md` has the design and what testing exposed.

- Two keys from two Google Cloud projects, free and paid, in the device keychain.
- Free preferred, paid fallback off by default, and only on a rate limit. A daily
  yen ceiling is checked before a paid request goes out, not after.
- `systemPrompt.ts` carries MAYA's persona, the advisor protocol and the field
  rules. Every line traces to a document.
- Company context is injected into the system prompt, so Phase 4 only has to
  supply the data.
- Settings screen holds the keys, the routing switches, the daily cap and today's
  usage.
- Falls back to the Phase 2 scripts when no key is stored, so a first run is
  still a working consultation.

Three things testing against the real model changed:

- **Do not request a field nothing renders.** `summary` was in the schema, the
  model looped inside it, hit the output ceiling, and returned JSON cut off
  mid-string. Dropped from the request, plus an output cap, plus a truncation
  check, plus length limits in the validator.
- **`maxLength` in `responseSchema` is not enforced.** A 60-character cap on
  `decision.title` came back at over 100.
- **`required` is what worked.** The model never returned `decision.reason` and
  crammed the reasoning into `title`. Requiring both fixed it in one attempt.
  Given nowhere to write something, it writes it in the next field along.

### Phase 4 — Company Brain

- `companyRepository.ts` stores the profile in `cached_company`, the table
  `docs/DATA_MODEL.md` already defined.
- Company screen is fully editable. Everything MAYA knows is on it, which is what
  `docs/UX_SPEC.md` §7 asks for: the user sees her knowledge rather than
  inferring it from her answers.
- The profile is injected into the system prompt on every turn. Live testing in
  Phase 3 showed this working: MAYA divided revenue by headcount to argue the
  problem was not staffing, and used a stated issue as the basis for the next
  action.
- A switch declares whether the numbers are real. Turning it on closes off the
  free key, because the profile goes out with every message and leaving that to
  the user to remember is not a safeguard.

Two things worth keeping in mind:

- The real/fictional flag has no column in the data model, so it rides in the
  issues blob under a reserved key rather than forcing a migration for one
  boolean. Phase 5 can give it a column while touching that table anyway.
- Saving failed silently in the browser, where there is no SQLite. The button
  looked like it worked. Failures now say so on screen, which matters more on a
  device than in the web preview.

### 会話の保存（Phase 2 の積み残し）

`docs/DATA_MODEL.md` が定義し migration が作っていた `cached_conversations` と
`cached_messages` に、どこからも書いていませんでした。相談はすべてメモリ上だけで、
アプリを閉じると消えていました。表だけ用意して使っていない状態です。

- 発言とMAYAの応答を保存する。応答は emotion / pose / scene / voice_key も残す
- 起動時に直近の会話を読み戻す
- 設定画面から全文を書き出して共有できる。表情とポーズ付きで出る

書き出しを付けたのは、MAYAの口調が狙いどおりか見直すのに、会話の実物が要るから
です。端末の中だけにあると、誰も読み返せません。

保存は best effort です。保存に失敗しても相談は相談なので、書き込みの失敗が
会話を止めることはありません。

## Verification

- 70 unit tests across 11 suites. Typecheck and lint are clean.
- `npx expo export --platform ios` bundles successfully.
- The app was run in a browser and checked visually: character renders, blinking runs, expression/pose/scene controls drive the character, the thinking caption appears, and the mouth opens during clip playback. The developer controls are absent from an export build, as `docs/ACCEPTANCE_CRITERIA.md` requires.

## Known issues and limitations

- **No audio plays yet.** The six OmniVoice clips are in `assets/audio/fixed/`, but
  `EnvelopeAudioEngine` is still the engine: it drives lip sync from an amplitude
  envelope and makes no sound. Phase 6 swaps in expo-audio. The clips landing
  unblocks that.
- Lip sync reads a shipped amplitude envelope rather than the live audio stream. React Native cannot read PCM from a playing file without a heavy native dependency, so the amplitude track has to ship alongside each clip.
- **`wink` has no master of its own** and borrows neutral's frames, so the wink
  itself does not show. The plan to derive it by closing one eye died when the
  pipeline moved to composited whole frames; `MayaArtwork` takes a single eye
  value. A tenth master would restore it.
- **Four scene plates are missing.** Only `scene_work.webp` exists;
  `docs/SCENE_PLATE_REQUEST.md` is the request for the rest.
- **The two expression sets are not at the same resolution.** `challenge` came
  from a 2K generation and bundles at 1086x1448; `neutral` is the `lite` 1K
  generation at 720x960. The app stretches both into the same box, so `neutral`
  renders softer.
- Decisions are still mocked records. `cached_decisions` exists but has no repository.
- SQLite is not enabled for the web target. The web build exists for fast layout iteration only and reports the local cache as unavailable.
- Animation was verified in a browser, not on an iPhone. The 60fps target in `docs/ACCEPTANCE_CRITERIA.md` is unverified on device.

## Finished-screen preview

`docs/preview/screens.html`, published at
`https://claude.ai/code/artifact/3784bc35-6fad-48b0-8e9b-df42a3193b33`.

Today, Talk and Decisions as they look when finished, built from the real
generated artwork and the first scene plate. The copy comes from `docs/UX_SPEC.md`
and the worked example in `docs/AI_RESPONSE_CONTRACT.md`, so it doubles as a check
that the response contract produces a screen worth looking at. Each screen carries
what already runs and what is still to build, which keeps it honest as the phases
land.

The first scene plate is in `assets/maya/scenes/scene_work.webp`. Four remain, and
`docs/SCENE_PLATE_REQUEST.md` is the pasteable request for them. It carries the
`work` plate as the reference, because the five have to read as one room at
different hours rather than five different places.

## Image asset requirements — confirmed

Settled before any generation, and written into `docs/ASSET_PIPELINE.md` and
`docs/IMAGE_GENERATION_GUIDE.md`.

- **Composition**: MAYA is a transparent cut-out; the five scenes are separate background plates. Baking backgrounds into expressions would turn emotion and scene into a cross product.
- **Expressions**: nine generated cut-outs matching `MayaEmotion`. `wink` is rendered from the eye frames and needs no image.
- **Animation**: eye frames for every expression, mouth frames for `neutral`, `smile`, `serious` and `challenge` only, since voice is used selectively.
- **Pose**: generated artwork for `default` only in v0.1. The union and the response contract are unchanged; the asset resolver falls back.
- **References**: the design sheet is not fed to the generator because its baked text bleeds into output. Three text-free crops were cut from it for that purpose.

Generated so far: 9 expression sets of four composited frames each, and one of
the five scene plates. Nothing is derived geometrically — every frame is a
generation composited through measured ellipse masks.

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

## Cloud session catch-up (2026-09-11)

The 23 commits from the Windows session are merged here. `npm run check` passes:
9 suites, 58 tests, typecheck and lint clean.

**`challenge-02` clears the drift gate.** `tools/measure_drift.py` reports scale
1.00, dx +0, dy +3, and the eye and mouth bands agree to 3px. The first attempt
failed all three checks. The locked-parent prompt now holds the geometry, which
was the open question the other 8 expressions were waiting on.

Two things the catch-up surfaced.

**The published bench frames still carried the pre-knee alpha.** Background alpha
measured 8-28 instead of 0, which is the grey plate `prepare_frames.py` was fixed
to remove; the frames had been published before that fix. Rebuilt and republished
at half the file size, background alpha now 0.

**The two poses are not at the same resolution.** `challenge` came from a 2K
generation and bundles at 1086x1448; `neutral` is still the `lite` 1K generation
and bundles at 720x960. The app stretches both into the same box, so it works,
but `neutral` renders softer. Worth settling before the remaining expressions,
otherwise the set ships mismatched.

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
- Phase 5 — Decisions: detection is already in the response contract and rendered on the Talk screen. What remains is persisting a confirmed decision and reading it back on the Decisions screen.
