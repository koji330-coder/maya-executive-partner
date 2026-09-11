"""Render a blink and lip sync preview from the derived frames.

The lip sync here is not a hand-waved approximation: it replays the amplitude
envelope from src/services/audio/clipManifest.ts through the same thresholds and
hold window as src/features/character/LipSyncController.ts, so the preview shows
what the app will actually do.
"""

from __future__ import annotations

import math
import random
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, "tools")
from face_frames import EyeConfig, MouthConfig, close_eye, open_mouth  # noqa: E402

FRAME_MS = 50


def envelope(duration_ms: int, seed: str) -> list[float]:
    """Port of synthesizeEnvelope in clipManifest.ts. Must stay in step with it."""
    frames = max(1, round(duration_ms / FRAME_MS))
    h = 0
    for ch in seed:
        h = (h * 31 + ord(ch)) % 9973
    out = []
    for i in range(frames):
        progress = i / frames
        fade = min(1.0, math.sin(math.pi * progress) * 1.6)
        syllable = 0.5 + 0.5 * math.sin((i / 3.1) * math.pi + h)
        jitter = 0.5 + 0.5 * math.sin((i / 1.7) * math.pi + h * 0.37)
        out.append(max(0.0, fade * (0.25 + 0.55 * syllable * jitter)))
    return out


def lip_sync(samples: list[float], small=0.08, open_=0.3, min_hold_ms=60) -> list[str]:
    """Port of LipSyncController: thresholds plus a hold window against flutter."""
    mouth, last_change, out = "closed", -10_000, []
    for i, amplitude in enumerate(samples):
        t = i * FRAME_MS
        a = min(1.0, max(0.0, amplitude))
        target = "open" if a >= open_ else "small" if a >= small else "closed"
        if target != mouth and t - last_change >= min_hold_ms:
            mouth, last_change = target, t
        out.append(mouth)
    return out


def blink_track(n_frames: int, seed: int = 7) -> list[str]:
    """Randomised blinks on the schedule from BlinkController."""
    rng = random.Random(seed)
    track = ["open"] * n_frames
    i = int(rng.uniform(3000, 7000) / FRAME_MS)
    while i < n_frames:
        # open -> half -> closed -> half -> open, about 300ms.
        for k, state in enumerate(["half", "closed", "closed", "half"]):
            if i + k < n_frames:
                track[i + k] = state
        double = rng.random() < 0.25
        i += 4 + (3 if double else 0)
        if double:
            for k, state in enumerate(["half", "closed", "half"]):
                if i + k < n_frames:
                    track[i + k] = state
            i += 3
        i += int(rng.uniform(3000, 7000) / FRAME_MS)
    return track


EYE_T = {"open": 0.0, "half": 0.5, "closed": 1.0}
MOUTH_A = {"closed": 0.0, "small": 7.0, "open": 17.0}


def render(master: str, cfg: dict, stage: tuple[int, int], char_h: int):
    """Pre-render the nine eye/mouth combinations composited onto the stage."""
    base = np.asarray(Image.open(master).convert("RGB"))
    eyes = [EyeConfig(**e) for e in cfg["eyes"]]
    mouth = MouthConfig(
        left=tuple(cfg["mouth"]["left"]),
        right=tuple(cfg["mouth"]["right"]),
        bottom=cfg["mouth"]["bottom"],
    )
    bg = np.array([139.0, 139.0, 139.0])
    plate = (231, 220, 203)

    out = {}
    for e_state, t in EYE_T.items():
        img = base
        for eye in eyes:
            img = close_eye(img, eye, t)
        for m_state, amount in MOUTH_A.items():
            frame = open_mouth(img, mouth, amount).astype(np.float32)
            # Key off the flat background and composite onto the scene plate.
            al = np.clip(np.abs(frame - bg).max(axis=2) / 34.0, 0, 1)[..., None]
            fg = np.clip(np.where(al > 0.02, (frame - (1 - al) * bg) / np.maximum(al, 0.02), frame), 0, 255)
            comp = fg * al + np.array(plate, dtype=np.float32) * (1 - al)
            ch = Image.fromarray(comp.astype(np.uint8))
            cw = round(ch.width * char_h / ch.height)
            ch = ch.resize((cw, char_h), Image.LANCZOS)
            canvas = Image.new("RGB", stage, plate)
            canvas.paste(ch, ((stage[0] - cw) // 2, stage[1] - char_h))
            out[(e_state, m_state)] = canvas
    return out
