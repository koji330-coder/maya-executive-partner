"""Bring generated background plates into the app bundle.

The generator hands back full-resolution PNGs named whatever it felt like. The
app wants `scene_<MayaScene>.webp` at the size the first plate established, so
the five sit together as one room rather than five differently-sized rooms.

Usage:
    python tools/import_scene_plates.py <incoming-dir>

Each file must start with the scene name, so `morning.png`, `morning_v2.png`
and `scene_morning.png` all land as `scene_morning.webp`.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

SCENES = ("morning", "work", "strategy", "casual", "late_night")
OUT = Path("assets/maya/scenes")

# The first accepted plate set these. Every later plate matches it, or the five
# stop reading as one room when the app cuts between them.
TARGET = (1086, 1454)
QUALITY = 88


def scene_of(path: Path) -> str | None:
    stem = path.stem.lower()
    # Longest first, so `late_night` is not swallowed by a shorter prefix.
    for scene in sorted(SCENES, key=len, reverse=True):
        if stem.startswith(scene) or stem.startswith(f"scene_{scene}"):
            return scene
    return None


def cool_fraction(image: Image.Image) -> float:
    """How much of the plate leans blue or violet.

    The brief bans both: MAYA's room is lit warm at every hour, and a night
    plate that drifts cool stops matching the other four. Counted rather than
    eyeballed, because a wash reads as neutral until it sits beside a warm
    plate.
    """
    small = image.convert("RGB").resize((128, 128))
    pixels = list(small.getdata())
    cool = sum(1 for r, _g, b in pixels if b > r + 12)
    return cool / len(pixels)


def main(incoming: Path) -> int:
    files = sorted(p for p in incoming.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"})
    if not files:
        print(f"{incoming} に画像がありません。")
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    for path in files:
        scene = scene_of(path)
        if scene is None:
            print(f"skip  {path.name} — ファイル名がシーン名で始まっていません {SCENES}")
            continue
        if scene in seen:
            print(f"skip  {path.name} — {scene} はすでに取り込み済み")
            continue
        seen.add(scene)

        image = Image.open(path).convert("RGB")
        source = image.size
        notes = []
        if abs(source[0] / source[1] - TARGET[0] / TARGET[1]) > 0.01:
            notes.append(f"縦横比が違います {source} → 引き伸ばされます")
        cool = cool_fraction(image)
        if cool > 0.25:
            notes.append(f"寒色が {cool:.0%} — 青紫は仕様で禁止")

        if source != TARGET:
            image = image.resize(TARGET, Image.LANCZOS)
        destination = OUT / f"scene_{scene}.webp"
        image.save(destination, "WEBP", quality=QUALITY, method=6)
        size_kb = destination.stat().st_size / 1024
        print(f"ok    {path.name} → {destination.name}  {source} → {TARGET}  {size_kb:.0f}KB")
        for note in notes:
            print(f"      ! {note}")

    missing = [s for s in SCENES if not (OUT / f"scene_{s}.webp").exists()]
    print(f"\n未着手: {', '.join(missing) if missing else 'なし'}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(Path(sys.argv[1])))
