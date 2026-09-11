"""Build the blink and lip sync preview clips."""
from __future__ import annotations

import json
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, "tools")
from preview_animation import blink_track, envelope, lip_sync, render  # noqa: E402

FRAME_MS = 50
STAGE = (780, 590)      # the Talk stage at 2x
CHAR_H = 542
JP = "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf"


def compose(frames, eye: str, mouth: str, caption: str) -> Image.Image:
    """Two panels: magnified for inspection, and actual phone size."""
    big = frames[(eye, mouth)]
    small = big.resize((STAGE[0] // 2, STAGE[1] // 2), Image.LANCZOS)
    canvas = Image.new("RGB", (STAGE[0] + small.width + 60, STAGE[1] + 44), "#F6F1E9")
    canvas.paste(big, (16, 34))
    canvas.paste(small, (STAGE[0] + 40, STAGE[1] + 34 - small.height))
    d = ImageDraw.Draw(canvas)
    f = ImageFont.truetype(JP, 20)
    d.text((16, 8), "拡大（2倍）", font=f, fill="#4A443D")
    d.text((STAGE[0] + 40, 8), "実寸（iPhoneのTalk画面）", font=f, fill="#4A443D")
    d.text((STAGE[0] + 40, 40), caption, font=ImageFont.truetype(JP, 18), fill="#8C8175")
    return canvas


def pack(states, frames, caption):
    """Collapse runs of identical states into one frame with a longer duration."""
    images, durations = [], []
    for eye, mouth in states:
        if images and (eye, mouth) == pack.last:
            durations[-1] += FRAME_MS
            continue
        images.append(compose(frames, eye, mouth, caption))
        durations.append(FRAME_MS)
        pack.last = (eye, mouth)
    pack.last = None
    return images, durations


pack.last = None

cfg = json.load(open("tools/maya-face-landmarks.json"))
frames = render("assets/reference/maya-face-reference.png", cfg, STAGE, CHAR_H)
print("合成済みの組み合わせ:", len(frames))

# Blink only, on the real 3-7s schedule.
n = 200
eyes = blink_track(n, seed=3)
images, durations = pack(
    [(e, "closed") for e in eyes], frames, "まばたきのみ（間隔は実装と同じ3〜7秒）"
)
images[0].save(
    "assets/reference/candidates/preview-blink.webp", save_all=True,
    append_images=images[1:], duration=durations, loop=0, quality=72, method=4,
)
print("まばたき:", len(images), "コマ /", sum(durations) / 1000, "秒")

# Lip sync driven by the manifest envelope, with blinks continuing underneath.
track = lip_sync(envelope(2600, "strong_disagree_01"))
eyes = blink_track(len(track) + 20, seed=11)
states = [("open", "closed")] * 8 + list(zip(eyes[: len(track)], track)) + [("open", "closed")] * 8
images, durations = pack(states, frames, "音声クリップのエンベロープでリップシンク")
images[0].save(
    "assets/reference/candidates/preview-lipsync.webp", save_all=True,
    append_images=images[1:], duration=durations, loop=0, quality=72, method=4,
)
print("リップシンク:", len(images), "コマ /", sum(durations) / 1000, "秒")
