# Asset Pipeline

## 1. Image generation source

Canonical character assets are generated with GPT image generation.

MAYA A is the approved base character.

Every generated asset must preserve:

- face identity
- hair color and shape
- eye style
- body proportions
- overall 2.5D rendering style

## 2. Asset preparation

The user will prepare blink and lip-sync material manually.

Recommended target structure:

```text
assets/maya/
├ base/
│  ├ body.webp
│  ├ hair_back.webp
│  ├ hair_front.webp
│  └ face.webp
├ eyes/
│  ├ open.webp
│  ├ half.webp
│  └ closed.webp
├ mouth/
│  ├ closed.webp
│  ├ small.webp
│  └ open.webp
├ expressions/
├ poses/
└ scenes/
```

Prefer WebP where quality and alpha support are acceptable.

## 3. First required asset set

Must-have before integration:

### Eyes
- open
- half
- closed

### Mouth
- closed
- small
- open

### Expressions
- neutral
- smile
- thinking
- serious
- challenge
- annoyed
- happy
- concerned

### Poses
- default
- thinking
- lean_forward
- relaxed

## 4. Audio assets

Offline render with OmniVoice Studio.

Store as:

```text
assets/audio/fixed/
├ greeting_morning_01.m4a
├ greeting_general_01.m4a
├ strong_disagree_01.m4a
├ wait_01.m4a
├ numbers_01.m4a
└ praise_01.m4a
```

Maintain an asset manifest:

```json
{
  "strong_disagree_01": {
    "text": "社長、それは私は反対です。",
    "style": "calm_serious",
    "file": "strong_disagree_01.m4a"
  }
}
```

## 5. Naming rules

Use stable semantic names, not names tied to a specific generated image ID.

Good:

- `emotion_challenge.webp`
- `pose_lean_forward.webp`

Bad:

- `maya_final2_new.webp`
