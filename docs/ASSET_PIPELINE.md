# Asset Pipeline

Confirmed for v0.1. This document defines structure, naming and formats.
`docs/IMAGE_GENERATION_GUIDE.md` defines the art direction and the prompts.

## 1. Composition model

**MAYA is generated as a transparent cut-out. Scenes are separate background plates.**

The character runtime treats emotion, pose, scene, eyelid frame and mouth frame
as independent axes (`MayaVisualState` in `src/features/character/mayaTypes.ts`).
Baking a background into each expression image would make emotion and scene a
cross product, and no single image would exist for a `challenge` + `late_night`
response. Layering keeps the asset count additive.

`docs/MAYA_CHARACTER_BIBLE.md` §6 warns against "a floating transparent PNG in a
chat app". A cut-out composited over a real scene plate satisfies that: the
warning is against having no environment, not against layering.

## 2. Reference images

| File | Role | Feed to the generator? |
| --- | --- | --- |
| `assets/reference/maya-character-bible.png` | Approved design sheet | **No.** Japanese copy, a logo and labels are baked in, and they bleed into generations. |
| `assets/reference/maya-face-reference.png` | Identity reference | Yes. Text-free crop of the hero portrait. |
| `assets/reference/maya-expression-reference.png` | Expression direction | Yes, when the target expression needs it. |
| `assets/reference/maya-wardrobe-reference.png` | Wardrobe and proportions only | Optional. Low resolution; never use it for facial identity. |

The three crops are cut from the design sheet and are low resolution: the face
is 287x412 and each expression panel is about 130px wide. They are a stopgap.
`docs/REFERENCE_IMAGE_REQUEST.md` is the request for a purpose-built replacement
set, and is the intended first step before production generation.

Once `emotion_neutral` is accepted it becomes the second reference and takes
priority for facial identity. The face reference remains the design baseline.

## 3. Directory structure

```text
assets/
├ reference/                       # design + identity references (above)
├ maya/
│  ├ source/                       # generation masters, PNG, not bundled
│  │  ├ emotion_neutral.png
│  │  ├ scene_work.png
│  │  └ generation-log.json
│  ├ expressions/                  # bundled cut-outs, WebP with alpha
│  │  ├ emotion_neutral.webp
│  │  ├ emotion_smile.webp
│  │  ├ emotion_thinking.webp
│  │  ├ emotion_serious.webp
│  │  ├ emotion_challenge.webp
│  │  ├ emotion_annoyed.webp
│  │  ├ emotion_happy.webp
│  │  ├ emotion_concerned.webp
│  │  └ emotion_relaxed.webp
│  ├ eyes/                         # derived per expression
│  │  ├ neutral_open.webp
│  │  ├ neutral_half.webp
│  │  ├ neutral_closed.webp
│  │  └ …one set per expression
│  ├ mouth/                        # derived, core expressions only
│  │  ├ neutral_closed.webp
│  │  ├ neutral_small.webp
│  │  ├ neutral_open.webp
│  │  └ …smile, serious, challenge
│  └ scenes/                       # bundled background plates, WebP
│     ├ scene_morning.webp
│     ├ scene_work.webp
│     ├ scene_strategy.webp
│     ├ scene_casual.webp
│     └ scene_late_night.webp
└ audio/fixed/                     # see §7
```

## 4. Required asset set

### Expressions — 9 generated cut-outs

`neutral`, `smile`, `thinking`, `serious`, `challenge`, `annoyed`, `happy`,
`concerned`, `relaxed`.

`wink` is the tenth value of `MayaEmotion` but needs **no generated image**. The
renderer produces it by holding one eye open and one closed from the existing eye
frames, which `PlaceholderMaya` already does.

### Eyes — every expression

Three frames per expression: `open`, `half`, `closed`.
`docs/ACCEPTANCE_CRITERIA.md` requires blinking whenever MAYA is on screen, and
any expression can persist on screen, so none can be missing.

### Mouth — core expressions only

Three frames (`closed`, `small`, `open`) for `neutral`, `smile`, `serious` and
`challenge`.

`docs/MAYA_CHARACTER_BIBLE.md` §5 uses voice selectively: greetings, strong
warnings, strong disagreement and meaningful praise. Those land on the four
expressions above. The remaining five never play a clip, so they only need a
resting mouth, which is already part of the expression image.

### Scenes — 5 background plates

`morning`, `work`, `strategy`, `casual`, `late_night`. No character in the plate.

### Poses — `default` only in v0.1

`MayaPose` keeps all seven values and the backend may return any of them, but
only `default` has generated artwork. The asset resolver falls back to `default`
for the rest. `PlaceholderMaya` continues to support all seven, so nothing in the
type system or the response contract changes.

Where a pose reads as part of an expression (a hand near the chin for `thinking`),
bake it into that expression's cut-out. That is a deliberate collapse of the pose
axis for v0.1, not an oversight.

## 5. Derivation rules

Eye and mouth frames are derived from their own expression image, never from a
different one. Separate generations shift the head position, angle and scale, so
frames cut from `emotion_neutral` will not register against `emotion_smile`.

Every derived frame must be pixel-aligned with its source cut-out: same canvas
size, same character position, only the eye or mouth region differs.

| Set | Count |
| --- | --- |
| Generated cut-outs | 9 |
| Generated scene plates | 5 |
| Derived eye frames | 27 |
| Derived mouth frames | 12 |

## 6. Format and framing

- **Generation masters**: PNG, on a flat neutral background that contrasts with
  dark brown hair, so the matte can be pulled cleanly. Long hair edges are the
  hard part of this pipeline.
- **Bundled assets**: WebP with alpha. Keep the total bundle small enough for a
  TestFlight build.
- **Aspect**: portrait, 3:4 to 4:5. The character box in `CharacterStage` is
  0.78 wide to tall, so both fit.
- **Framing**: one crop only, chest to waist, character centred. The Talk stage
  is 35% of screen height and the Today stage is taller; the app scales and
  bottom-anchors the same asset rather than shipping two crops.
- The character must be centred, not offset. The Talk screen puts text below the
  stage, not beside it.
- No text of any kind baked into an image. All copy is rendered by React Native.

## 7. Naming rules

Stable semantic names, never names tied to a generated image ID.

Good: `emotion_challenge.webp`, `scene_late_night.webp`, `neutral_closed.webp`
Bad: `maya_final2_new.webp`, `late-night.webp`

Scene file names use the underscore spelling of `MayaScene`, so `late_night`,
not `late-night`.

## 8. Audio assets

Offline render with OmniVoice Studio.

```text
assets/audio/fixed/
├ greeting_morning_01.m4a
├ greeting_general_01.m4a
├ strong_disagree_01.m4a
├ wait_01.m4a
├ numbers_01.m4a
└ praise_01.m4a
```

`src/services/audio/clipManifest.ts` is the manifest. Each clip ships with the
amplitude envelope measured from its render, because lip sync reads the envelope
rather than the live audio stream.
