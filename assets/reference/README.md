# Reference images

| File | Role | Feed to the generator? |
| --- | --- | --- |
| `maya-character-bible.png` | Approved design sheet | **No.** Japanese copy, a logo and panel labels are baked in and bleed into output. |
| `maya-face-reference.png` | Identity reference | Yes. Text-free crop of the hero portrait. |
| `maya-expression-reference.png` | Expression direction | Yes, when the target expression needs it. |
| `maya-wardrobe-reference.png` | Wardrobe and proportions only | Optional. Low resolution; never use for facial identity. |
| `maya-safe-zone-diagram.png` | Eye and mouth safe zones for blink and lip sync derivation | Yes, as a spec attachment. See `docs/REFERENCE_IMAGE_REQUEST.md`. |

The three crops are cut from the design sheet. Once `emotion_neutral` is
accepted it becomes the second reference and takes priority for facial identity.
