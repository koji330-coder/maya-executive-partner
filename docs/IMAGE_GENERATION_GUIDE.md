# MAYA Image Generation Guide

Art direction and prompts. Structure, naming and formats are in
`docs/ASSET_PIPELINE.md`.

## 1. Canonical character

MAYA is already designed. Do not invent a new character and do not redesign her
between assets.

Identity reference: `assets/reference/maya-face-reference.png`.

Do **not** feed `assets/reference/maya-character-bible.png` to the generator. It
carries Japanese copy, a logo and panel labels that bleed into output.

Fixed characteristics:

- adult Japanese woman, canonical age 27
- dark-brown long hair, unchanged in length and colour
- soft but intelligent facial features
- large, expressive, natural eyes
- polished 2.5D premium mobile-game rendering
- ivory / white business-casual wardrobe as default
- attractive and approachable rather than photorealistic

Never:

- a different face, hair length or hair colour
- a noticeably different age
- a Western appearance
- full photorealism, or anime-cartoon proportions
- sci-fi holograms, cyberpunk, blue-purple "AI" neon
- a generic black business suit
- excessive skin exposure or gravure-style posing

The balance to hold: close enough that the user wants to open the app daily,
competent enough to advise a CEO.

## 2. Common prompt

Use as the shared prefix for every generation.

```text
Use the supplied MAYA reference image as the strict identity reference.
Generate the exact same adult woman as shown in the reference.
Preserve her facial identity, hairstyle, hair colour, eye shape, age impression,
proportions, and overall visual style.
MAYA is a Japanese AI executive partner in her late twenties.

Visual direction:
- polished 2.5D AI beauty, premium Japanese mobile app character
- attractive, cute, intelligent, approachable
- slightly intimate presence, elegant rather than flashy
- not photorealistic, not anime-cartoon, not sci-fi, not cyberpunk
- not a generic office stock-photo woman

Framing:
- portrait orientation, chest to waist, character centred
- face large enough to read clearly on a phone
- flat neutral studio background that contrasts with dark brown hair
- hair silhouette fully separated from the background, no blending
- clean hands, no anatomical breakage
- absolutely no text, no logo, no UI, no captions anywhere in the image

Maintain strict character consistency with the supplied reference.
Do not redesign the character.
```

The flat background is intentional. Characters are cut out and composited over
separate scene plates, so a rendered environment in the character image would be
discarded and would contaminate the matte.

## 3. Generation order

Do not generate everything at once.

1. **`emotion_neutral`.** The master. Stop and regenerate if identity is off.
2. **`smile`, `serious`, `thinking`, `challenge`**, using neutral as the second reference.
3. **`annoyed`, `happy`, `concerned`, `relaxed`.**
4. **Scene plates**, which contain no character.

From step 2 onward pass two references: the face reference as the design
baseline, and the accepted `emotion_neutral` as the facial identity lock.

## 4. The neutral master

`emotion_neutral` is not just the resting expression. Every eye and mouth frame
for that expression is cut from it, so it must be:

- front-facing to at most a light three-quarter angle
- mouth naturally closed
- both eyes fully open
- hair clear of the eyes and mouth
- free of strong shadows across the face
- both hands out of the face region, so nothing occludes the eye or mouth cut

If any of these fail, regenerate. This one image sets the ceiling on animation
quality for the whole app.

The same constraints apply to every other expression, since each one now carries
its own eye frames.

## 5. Expressions

Nine cut-outs. `wink` is produced by the renderer from existing eye frames and
is not generated.

**neutral** — calm, soft, attentive. A very subtle friendly smile. Direct eye
contact. She looks ready to listen.

**smile** — warm, genuine, the eyes smiling too. Friendly, never childish.
Slightly closer emotional distance than neutral.

**serious** — focused, no smile, strong direct eye contact. Intelligent and
slightly concerned, about to tell the CEO something important. Not angry.

**thinking** — gaze slightly away, considering. A natural thinking posture; one
hand may touch the chin if it stays clear of the eyes and mouth. Do not
exaggerate.

**challenge** — the signature asset. Confident, faintly teasing, intelligent.
One eyebrow subtly raised, a faint knowing smile, direct eye contact. The feeling
is 「Gakky、それ本当にやります？」. Tension comes from eye contact and confidence,
never from anything explicitly seductive. Not arrogant.

**annoyed** — mildly exasperated but still affectionate. Slightly narrowed eyes,
a subtle "I told you so". The feeling is 「……Gakky、それ先月も言ってましたよ？」.
Not angry, and no comedic anime exaggeration.

**happy** — clearly happy and proud, a bright genuine smile, personally pleased
about the user's success. Still elegant and adult.

**concerned** — worried on the user's behalf without confrontation. Softened
brows, a slight forward tilt. Used for downside risk where `serious` would be too
hard. This expression is required by `docs/AI_RESPONSE_CONTRACT.md`.

**relaxed** — gentle, softer gaze, a slight smile, a more casual posture.
Emotionally closer but still elegant.

## 6. Scene plates

Background only. No character, no people, no text, no readable figures on any
screen or chart.

Each plate is a shift of the same room, not a different world. Palette is cream,
ivory, charcoal and muted gold throughout.

**morning** — warm modern office, soft natural morning light, fresh and bright.

**work** — the same office mid-day, a clean desk area, warm neutral colours.

**strategy** — a meeting area with a large display showing abstract shapes only.
Cooler and more focused. No readable figures or fake financial text.

**casual** — a softer lounge corner of the same space, warmer and less formal.

**late_night** — executive office or private lounge at night, Tokyo-like city
lights through the window, warm indirect lighting. The mood is more personal than
daytime. Achieve it through lighting and depth, never through styling that reads
as a nightclub or a bedroom.

Pair `late_night` with `relaxed` or `concerned` for the intended effect. The
character wardrobe stays the same across scenes, since one cut-out is composited
over all five plates.

## 7. Acceptance

Score each asset against the reference on a ten-point scale:

`face_identity`, `hair_consistency`, `age_consistency`, `eye_consistency`,
`visual_style`, `brand_fit`, `anatomy_quality`, `ios_usability`

Reject below 8 on `face_identity`. Regenerate below 9 on `hair_consistency`.

Self-scoring by the generating model is weak evidence. Before accepting an asset,
place it beside the reference and beside the already-accepted assets and confirm
it reads as the same person in that comparison. An image that looks good but does
not look like MAYA is rejected.

Also check the asset against its job:

- Can the eye and mouth regions be cut cleanly?
- Does the hair silhouette survive matting?
- Is the face large enough at the Talk stage size?
- Does the expression's role read without a caption?

Record every result in `assets/maya/source/generation-log.json`:

```json
{
  "asset": "emotion_challenge.png",
  "status": "accepted",
  "references": ["maya-face-reference.png", "emotion_neutral.png"],
  "scores": {
    "face_identity": 9,
    "hair_consistency": 10,
    "age_consistency": 9,
    "eye_consistency": 9,
    "visual_style": 9,
    "brand_fit": 10,
    "anatomy_quality": 9,
    "ios_usability": 9
  },
  "notes": "Good identity match. Eyebrow raise reads without tipping into arrogance."
}
```

## 8. Completion

The first asset round is done when nine expression cut-outs and five scene plates
exist, and:

- every expression reads as the same person
- each expression's eye frames can be derived from it
- `neutral`, `smile`, `serious` and `challenge` can also yield mouth frames
- `challenge` carries MAYA's character
- `late_night` is attractive without being explicit
- everything is usable at iPhone portrait size
