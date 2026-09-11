# MAYA character assets

Structure and formats: `docs/ASSET_PIPELINE.md`.
Art direction and prompts: `docs/IMAGE_GENERATION_GUIDE.md`.

```text
assets/maya/
├ source/        generation masters (PNG, not bundled) + generation-log.json
├ expressions/   emotion_<name>.webp — 9 cut-outs with alpha
├ eyes/          <emotion>_open|half|closed.webp — every expression
├ mouth/         <emotion>_closed|small|open.webp — neutral, smile, serious, challenge
└ scenes/        scene_<name>.webp — 5 background plates, no character
```

MAYA is a transparent cut-out; scenes are separate background plates. The
character runtime treats emotion, pose, scene, eyelid and mouth as independent
axes, so baking a background into an expression would make emotion and scene a
cross product.

Eye and mouth frames are derived from their own expression image and must be
pixel-aligned with it. Frames cut from one expression do not register against
another, because separate generations shift the head.

`wink` needs no image. The renderer holds one eye open and one closed.

Until these assets exist the app renders
`src/features/character/placeholder/PlaceholderMaya.tsx`, which consumes exactly
the same state. Swapping in the real layers is a change to that one component.
