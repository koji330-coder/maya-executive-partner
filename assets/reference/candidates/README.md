# Reference candidates

Generated candidates for the reference rebuild, with their reviews. Evaluations
are recorded in `assets/maya/source/generation-log.json`.

| File | What it is |
| --- | --- |
| `neutral-a-01.png` | First candidate for A, the front neutral master. Revision requested. |
| `neutral-a-01-review.png` | The same image with the safe zones and the one violation marked. |
| `neutral-a-01-matte-test.png` | The candidate keyed off its grey background and composited over a warm plate. |
| `neutral-a-01-correction.md` | The correction request sent back to the generator. |

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
