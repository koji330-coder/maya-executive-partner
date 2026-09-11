# Reference images

| File | Role | Feed to the generator? |
| --- | --- | --- |
| `maya-character-bible.png` | Approved design sheet | **No.** Japanese copy, a logo and panel labels are baked in and bleed into output. |
| `maya-face-reference.png` | Identity reference | Yes. Purpose-generated master (1086x1448), accepted from the reference rebuild. Replaced the 287x412 crop. |
| `maya-expression-reference.png` | Expression direction | Yes, when the target expression needs it. |
| `maya-wardrobe-reference.png` | Wardrobe and proportions only | Optional. Low resolution; never use for facial identity. |
| `maya-safe-zone-diagram.png` | The two-tier safe zones. Eyes and mouth are absolute; eyebrows need only stay readable. | Yes, as a spec attachment. See `docs/REFERENCE_IMAGE_REQUEST.md`. |

`maya-expression-reference.png` and `maya-wardrobe-reference.png` are still crops
from the design sheet. `maya-face-reference.png` is no longer a crop: it is the
accepted master from the reference rebuild, kept alongside its candidate history
in `candidates/`.

Once `emotion_neutral` is accepted it becomes the second reference and takes
priority for facial identity.
