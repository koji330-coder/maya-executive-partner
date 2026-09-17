"""表情マスターと差分から、アプリが読む4枚のwebpを組む。

差分は絵の全面を描き直してくる。髪の一本一本まで変わる。だから位置合わせは
画像全体の一致ではなく、目と口の楕円だけを上書きして成立させている
(docs/NANO_BANANA_PIPELINE.md §3)。マスクの外でモデルが揺らいでも画面には出ない。

使い方:
    python tools/build_expression_frames.py smile \\
        --master assets/reference/candidates/smile-01.png \\
        --eyes   assets/maya/source/smile-01-eyes-closed.png \\
        --mouth  assets/maya/source/smile-01-mouth-open.png

`--mouth` は省略できる。声を出すのは4表情だけで、残りは閉じた口のままで足りる
(docs/ASSET_PIPELINE.md §4)。省いた場合、口を開けた2枚はマスターの口のまま作る。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# docs/NANO_BANANA_PIPELINE.md §6 の実測値。キャンバスに対する百分率なので、
# 2K で出しても 1K で出してもそのまま効く。
EYE_LEFT = (38.9, 29.1, 7.0, 3.6)
EYE_RIGHT = (58.2, 27.1, 7.6, 3.9)
MOUTH = (51.6, 39.8, 14.5, 3.5)

# 既存の neutral と同じ寸法。アプリの表示はこれより小さい。
TARGET = (1086, 1448)

# 背景からの距離でアルファを作る。KNEE から下は完全な透明。
# これが無いと背景のノイズがアルファ10〜27で残り、灰色の矩形として見える。
KNEE = 8.0
THRESHOLD = 34.0

FRAMES = (
    "eyes_open__mouth_closed",
    "eyes_closed__mouth_closed",
    "eyes_open__mouth_open",
    "eyes_closed__mouth_open",
)


def ellipse_mask(size: tuple[int, int], ellipses) -> Image.Image:
    w, h = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    for cx, cy, rx, ry in ellipses:
        draw.ellipse(
            [(cx - rx) / 100 * w, (cy - ry) / 100 * h, (cx + rx) / 100 * w, (cy + ry) / 100 * h],
            fill=255,
        )
    # 縁を溶かす。硬い境界は切り貼りに見える。
    return mask.filter(ImageFilter.GaussianBlur(w * 0.006))


def cut_out(image: Image.Image) -> Image.Image:
    """平坦な背景を抜いて、縁の色移りを戻す。"""
    a = np.asarray(image.resize(TARGET, Image.LANCZOS).convert("RGB"), dtype=np.float32)
    # 標本は上の左右の隅だけ。下の隅は髪と服で、混ぜると背景色を見失って
    # 全面が不透明のまま残る。一度それで踏んだ。
    background = np.concatenate(
        [a[:60, :60].reshape(-1, 3), a[:60, -60:].reshape(-1, 3)]
    ).mean(axis=0)
    distance = np.sqrt(((a - background) ** 2).sum(axis=2))
    alpha = np.clip((distance - KNEE) / (THRESHOLD - KNEE), 0, 1)
    # 非プリマルチプライ化。半透明の画素に乗った背景色を差し引く。
    rgb = np.clip(background + (a - background) / np.maximum(alpha[..., None], 1e-3), 0, 255)
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("emotion")
    parser.add_argument("--master", required=True, type=Path)
    parser.add_argument("--eyes", required=True, type=Path)
    parser.add_argument("--mouth", type=Path)
    parser.add_argument("--out", type=Path, default=Path("assets/maya/expressions"))
    args = parser.parse_args()

    master = Image.open(args.master).convert("RGB")
    eyes = Image.open(args.eyes).convert("RGB").resize(master.size)
    mouth = Image.open(args.mouth).convert("RGB").resize(master.size) if args.mouth else None

    eye_mask = ellipse_mask(master.size, [EYE_LEFT, EYE_RIGHT])
    open_mouth = (
        Image.composite(mouth, master, ellipse_mask(master.size, [MOUTH]))
        if mouth is not None
        else master
    )

    composites = {
        "eyes_open__mouth_closed": master,
        "eyes_closed__mouth_closed": Image.composite(eyes, master, eye_mask),
        "eyes_open__mouth_open": open_mouth,
        "eyes_closed__mouth_open": Image.composite(eyes, open_mouth, eye_mask),
    }

    directory = args.out / args.emotion
    directory.mkdir(parents=True, exist_ok=True)
    for name in FRAMES:
        cut = cut_out(composites[name])
        path = directory / f"{name}.webp"
        cut.save(path, "WEBP", quality=90, method=6)
        opaque = (np.asarray(cut)[..., 3] > 0).mean()
        print(f"  {name:<28} {path.stat().st_size // 1024:>4} KB  不透明 {opaque:.1%}")

    if mouth is None:
        print("  ※ 口を開けた絵なし。開口の2枚はマスターの口のまま。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
