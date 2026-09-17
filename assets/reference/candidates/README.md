# Reference candidates

Generated candidates for the reference rebuild, with their reviews. Evaluations
are recorded in `assets/maya/source/generation-log.json`.

| File | What it is |
| --- | --- |
| `neutral-a-01.png` | First candidate for A. Revision requested: a bang fully hid the viewer-left eyebrow and reached the upper lid. |
| `neutral-a-02.png` | Second candidate. **Accepted** and promoted to `assets/reference/maya-face-reference.png`. |
| `neutral-a-02-matte-test.png` | The accepted master keyed and composited over a warm plate. |
| `neutral-a-01-review.png` | The same image with the safe zones and the one violation marked. |
| `neutral-a-01-matte-test.png` | The candidate keyed off its grey background and composited over a warm plate. |
| `neutral-a-01-correction.md` | The correction request sent back to the generator. |

## Why the eyebrow stopped being a blocker

Candidate 02 still has a bang across the viewer-left eyebrow, and it was accepted
anyway. The first spec was wrong to treat brows like eyes.

A blink moves the upper lid, the eyeball and the lower lid. It does not move the
eyebrow. Hair lying across a brow is therefore static and never fights the
animation. What the brow does affect is expression legibility, since `challenge`,
`annoyed` and `concerned` are carried by it, so the brow only needs to stay
readable.

Both eye apertures in candidate 02 are clear, including the lid travel space
between brow and lash line. That is the condition that actually governs blinking,
and it is met.

The alternative was to ask for a hairstyle change. The bangs are part of MAYA's
identity, and changing them to satisfy a constraint the technique does not
require would have been the wrong trade.

## What the matte test established

The cut-out plus scene-plate model in `docs/ASSET_PIPELINE.md` §1 is no longer an
assumption. Alpha was derived from distance to the flat background colour,
unpremultiplied to remove grey spill, and composited over a warm cream plate. Fine
flyaway strands came through without a halo.

Two consequences:

- The hair does not need to be tidied. Flat backgrounds solve the problem that
  hair detail would otherwise cause, so the reference request should keep asking
  for a flat background rather than for simpler hair.
- The scene plates can be warm without fighting the character edges.
