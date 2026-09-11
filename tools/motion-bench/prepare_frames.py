"""Cut the four composited frames out of their generation background.

The Nano Banana outputs carry the flat generation background. The bench needs
transparent cut-outs so the page can put MAYA on any ground, so this keys off the
background colour, removes the spill it leaves on hair edges, and writes WebP at
a size a phone will actually load.

  python3 tools/motion-bench/prepare_frames.py \
      --pose neutral \
      --master assets/reference/pipeline-test/neutral_master.png \
      --blink  assets/reference/pipeline-test/neutral_blink.png \
      --mouth  assets/reference/pipeline-test/neutral_mouth_open.png \
      --both   assets/reference/pipeline-test/neutral_blink_mouth_open.png

Requires Pillow and numpy. Output goes to build/motion-bench/frames/<pose>/ and
is published alongside bench.html; it is not committed.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

# The generation background. Measured, not assumed: sample a few corners of a
# fresh batch before trusting this.
DEFAULT_BG = (138.5, 138.5, 138.5)

# Distance from the background at which a pixel counts as fully foreground.
# Too low and hair edges keep a halo; too high and fine strands disappear.
DEFAULT_TOLERANCE = 34.0

STATES = {
    "master": "eyes_open__mouth_closed",
    "blink": "eyes_closed__mouth_closed",
    "mouth": "eyes_open__mouth_open",
    "both": "eyes_closed__mouth_open",
}


def cut_out(path: Path, bg: tuple[float, float, float], tol: float, width: int) -> Image.Image:
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    bg_arr = np.array(bg, dtype=np.float32)

    alpha = np.clip(np.abs(rgb - bg_arr).max(axis=2) / tol, 0, 1)[..., None]
    # Unpremultiply so semi-transparent strands do not carry the background's
    # colour onto a warm scene plate.
    fg = np.clip(
        np.where(alpha > 0.02, (rgb - (1 - alpha) * bg_arr) / np.maximum(alpha, 0.02), rgb),
        0, 255,
    )

    out = Image.fromarray(np.dstack([fg, alpha * 255]).astype(np.uint8), "RGBA")
    if width and width < out.width:
        out = out.resize((width, round(out.height * width / out.width)), Image.LANCZOS)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pose", required=True, help="ポーズID。出力フォルダ名になる")
    for key in STATES:
        ap.add_argument(f"--{key}", required=True, type=Path)
    ap.add_argument("--out", type=Path, default=Path("build/motion-bench/frames"))
    ap.add_argument("--width", type=int, default=860)
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--bg", type=float, nargs=3, default=list(DEFAULT_BG),
                    help="生成背景のRGB。既定は中間グレー")
    ap.add_argument("--tolerance", type=float, default=DEFAULT_TOLERANCE)
    args = ap.parse_args()

    dest = args.out / args.pose
    dest.mkdir(parents=True, exist_ok=True)

    total = 0
    for key, name in STATES.items():
        src = getattr(args, key)
        if not src.exists():
            raise SystemExit(f"見つかりません: {src}")
        img = cut_out(src, tuple(args.bg), args.tolerance, args.width)
        target = dest / f"{name}.webp"
        img.save(target, quality=args.quality, method=6)
        size = target.stat().st_size
        total += size
        print(f"{target}  {img.width}x{img.height}  {size / 1024:.0f}KB")
    print(f"合計 {total / 1024 / 1024:.2f}MB")


if __name__ == "__main__":
    main()
