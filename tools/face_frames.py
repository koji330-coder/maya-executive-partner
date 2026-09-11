"""Derive blink and lip sync frames from a single MAYA cut-out.

The generator cannot produce pixel-aligned eye and mouth variants, so the frames
are built geometrically from one accepted master. That keeps every frame in
register with its source by construction, which is what the character runtime
needs (docs/ASSET_PIPELINE.md §5).

Eyes close by stretching the eyelid strip down over the aperture and carrying the
real lash line down with it. Mouths open by shifting everything below the lip
line down per column, most in the middle and not at all at the corners, and
filling the gap with an interior.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass

import numpy as np
from PIL import Image


@dataclass
class EyeConfig:
    """All coordinates are in master-image pixels."""

    name: str
    x0: int
    x1: int
    lid_top: int      # top of the eyelid strip used as the closing lid
    lash_top: int     # upper lash line of the open eye
    lash_bottom: int  # lower lash line
    close_at: float = 0.95   # where the lids meet, as a fraction of the aperture
    feather: int = 16        # horizontal blend, in pixels
    lash_band: int = 9       # thickness of the lash band carried down
    despill: int = 27        # horizontal median width used to clean the lid strip
    blend_bottom: int = 12   # vertical blend where the lid meets the eye


@dataclass
class MouthConfig:
    left: tuple[int, int]    # left corner of the lip line
    right: tuple[int, int]   # right corner of the lip line
    bottom: int              # last row that moves with the jaw
    interior: tuple[int, int, int] = (72, 34, 36)
    teeth: tuple[int, int, int] = (236, 224, 214)


def _feather_mask(w: int, h: int, feather: int, top: int = 0, bottom: int = 0) -> np.ndarray:
    """Ramp the edges of a rectangular paste so it leaves no visible seam."""
    ramp = np.ones(w, dtype=np.float32)
    if feather > 0 and w > 2:
        edge = np.linspace(0.0, 1.0, max(1, min(feather, w // 2)), dtype=np.float32)
        ramp[: len(edge)] = edge
        ramp[-len(edge):] = edge[::-1]
    mask = np.repeat(ramp[None, :], h, axis=0)
    vert = np.ones(h, dtype=np.float32)
    if top > 0 and h > 2:
        e = np.linspace(0.0, 1.0, max(1, min(top, h // 2)), dtype=np.float32)
        vert[: len(e)] = e
    if bottom > 0 and h > 2:
        e = np.linspace(0.0, 1.0, max(1, min(bottom, h // 2)), dtype=np.float32)
        vert[-len(e):] = e[::-1]
    return (mask * vert[:, None])[..., None]


def _clean_strip(strip: np.ndarray, width: int) -> np.ndarray:
    """Remove hair strands from the eyelid strip with a horizontal median.

    The strip between brow and lash is what gets stretched into a closed lid, so
    a bang crossing it smears into vertical streaks. Skin varies slowly across
    the face and strands are thin, so a wide horizontal median keeps the shading
    and drops the hair.
    """
    if width < 3 or strip.shape[1] < width:
        return strip
    pad = width // 2
    padded = np.pad(strip, ((0, 0), (pad, pad), (0, 0)), mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(padded, width, axis=1)
    return np.median(windows, axis=-1).astype(np.float32)


def close_eye(img: np.ndarray, cfg: EyeConfig, t: float) -> np.ndarray:
    """Return a copy of `img` with the eye closed by `t` (0 open, 1 closed)."""
    if t <= 0:
        return img
    out = img.copy()
    x0, x1 = cfg.x0, cfg.x1
    aperture = cfg.lash_bottom - cfg.lash_top
    meet = cfg.lash_top + cfg.close_at * aperture
    edge = int(round(cfg.lash_top + t * (meet - cfg.lash_top)))

    # The lash band is lifted before the lid is drawn, then put back at the new
    # edge, so the closed eye keeps the master's real lashes and their curve.
    lash = img[cfg.lash_top - 2 : cfg.lash_top + cfg.lash_band, x0:x1].astype(np.float32)

    lid = _clean_strip(img[cfg.lid_top : cfg.lash_top, x0:x1].astype(np.float32), cfg.despill)
    target_h = edge - cfg.lid_top
    if target_h <= 0 or lid.shape[0] == 0:
        return out
    stretched = np.asarray(
        Image.fromarray(lid.astype(np.uint8)).resize((x1 - x0, target_h), Image.BICUBIC),
        dtype=np.float32,
    )
    # The top row matches its source exactly, so only the bottom is feathered,
    # where the lid meets the eye that is still showing beneath it.
    m = _feather_mask(x1 - x0, target_h, cfg.feather, bottom=cfg.blend_bottom)
    region = out[cfg.lid_top : edge, x0:x1].astype(np.float32)
    out[cfg.lid_top : edge, x0:x1] = (stretched * m + region * (1 - m)).astype(np.uint8)

    top = max(cfg.lid_top, edge - 2)
    band = lash[: min(lash.shape[0], img.shape[0] - top)]
    if band.shape[0]:
        m = _feather_mask(x1 - x0, band.shape[0], cfg.feather, top=3, bottom=4)
        region = out[top : top + band.shape[0], x0:x1].astype(np.float32)
        out[top : top + band.shape[0], x0:x1] = (band * m + region * (1 - m)).astype(np.uint8)
    return out


def open_mouth(img: np.ndarray, cfg: MouthConfig, amount: float) -> np.ndarray:
    """Return a copy of `img` with the mouth opened by `amount` pixels.

    Each column is shifted by a sub-pixel amount and resampled, so the interior
    edge follows the lip curve smoothly instead of stepping column to column.
    """
    if amount <= 0:
        return img
    out = img.copy()
    (xl, yl), (xr, yr) = cfg.left, cfg.right
    interior = np.array(cfg.interior, dtype=np.float32)
    teeth = np.array(cfg.teeth, dtype=np.float32)

    for x in range(xl, xr + 1):
        u = (x - xl) / max(1, xr - xl)
        lip_y = yl + (yr - yl) * u
        # Corners of the mouth barely move; the middle moves the most.
        drop = amount * math.sin(math.pi * u) ** 0.7
        if drop < 0.05:
            continue

        y0, y1 = int(math.floor(lip_y)), cfg.bottom
        rows = np.arange(y0, y1, dtype=np.float32)
        column = img[y0:y1, x].astype(np.float32)
        # Everything below the lip line slides down by `drop`.
        src = rows - drop
        shifted = np.stack(
            [np.interp(src, rows, column[:, c]) for c in range(3)], axis=1
        )

        # Interior fill, anti-aliased against the moving lip edge.
        depth = np.clip((lip_y + drop - rows) / max(drop, 1e-3), 0.0, 1.0)
        grad = np.clip(1.0 - depth, 0.0, 1.0)[:, None]
        fill = interior[None, :] * (0.70 + 0.30 * grad)
        if amount >= 9:
            k = np.clip((depth - 0.62) / 0.38, 0.0, 1.0)[:, None] * 0.75
            fill = fill * (1 - k) + teeth[None, :] * k

        # Anti-alias both edges of the gap: it fades in at the lip line and out
        # where the lower lip now sits.
        coverage = (
            np.clip(lip_y + drop - rows, 0.0, 1.0)
            * np.clip(rows - lip_y + 1.0, 0.0, 1.0)
        )[:, None]
        out[y0:y1, x] = np.clip(
            fill * coverage + shifted * (1 - coverage), 0, 255
        ).astype(np.uint8)
    return out


EYE_STATES = {"open": 0.0, "half": 0.5, "closed": 1.0}
MOUTH_STATES = {"closed": 0.0, "small": 7.0, "open": 17.0}


def build(master_path: str, config_path: str) -> dict[str, np.ndarray]:
    """Build every eye and mouth frame as a full-size image."""
    cfg = json.load(open(config_path))
    base = np.asarray(Image.open(master_path).convert("RGB"))
    eyes = [EyeConfig(**e) for e in cfg["eyes"]]
    mouth = MouthConfig(
        left=tuple(cfg["mouth"]["left"]),
        right=tuple(cfg["mouth"]["right"]),
        bottom=cfg["mouth"]["bottom"],
    )

    frames: dict[str, np.ndarray] = {}
    for state, t in EYE_STATES.items():
        img = base
        for eye in eyes:
            img = close_eye(img, eye, t)
        frames[f"eyes_{state}"] = img
    for state, amount in MOUTH_STATES.items():
        frames[f"mouth_{state}"] = open_mouth(base, mouth, amount)
    return frames
