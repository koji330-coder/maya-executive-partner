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

All nine generated expressions exist. `PlaceholderMaya` stays in the tree for
poses other than `default` and as the fallback if a frame ever fails to resolve,
but it is no longer what the app normally shows.

Frames are built by `tools/build_expression_frames.py`, not by hand. It carries
the measured ellipse masks, the alpha knee that stops background noise becoming
a grey rectangle, and the rule that the background is sampled from the two top
corners only — the bottom corners are hair and blouse, and averaging them in
leaves the whole frame opaque.
