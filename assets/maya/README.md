# MAYA character assets

Generated layers go here, following `docs/ASSET_PIPELINE.md`.

```text
assets/maya/
├ base/         body.webp, hair_back.webp, hair_front.webp, face.webp
├ eyes/         open.webp, half.webp, closed.webp
├ mouth/        closed.webp, small.webp, open.webp
├ expressions/  emotion_<name>.webp
├ poses/        pose_<name>.webp
└ scenes/       scene_<name>.webp
```

Until these exist, the app renders `src/features/character/placeholder/PlaceholderMaya.tsx`,
which consumes exactly the same state (emotion, pose, eyelid frame, mouth frame,
breath, idle drift). Swapping in the real layers is a change to that one component.

Naming must stay semantic — `emotion_challenge.webp`, never `maya_final2_new.webp`.
