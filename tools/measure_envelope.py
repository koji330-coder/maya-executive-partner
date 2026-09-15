"""Measure the amplitude track a rendered clip needs to ship with.

Lip sync reads the envelope, not the audio stream: React Native cannot pull PCM
out of a playing file without a heavy native dependency, so the amplitude has
to be measured here and bundled alongside the clip
(`src/services/audio/types.ts`).

Usage:
    python tools/measure_envelope.py <clip.wav> [frame-ms]

Prints the manifest fields for the clip, ready to paste into
`src/services/audio/clipManifest.ts`.
"""

from __future__ import annotations

import json
import sys
import wave
from array import array
from pathlib import Path

DEFAULT_FRAME_MS = 50

# The floor below which a bucket counts as silence rather than a quiet syllable.
# Room tone in a render is never truly zero, and leaving it in makes the mouth
# twitch through the gaps between words.
NOISE_FLOOR = 0.04


# `audioop` would do this in three calls, but it is removed in Python 3.13 and
# this is a handful of lines without it.
TYPECODES = {2: "h", 4: "i"}


def samples_of(path: Path) -> tuple[list[int], int]:
    """Mono samples and the sample rate."""
    with wave.open(str(path), "rb") as source:
        channels = source.getnchannels()
        width = source.getsampwidth()
        rate = source.getframerate()
        raw = source.readframes(source.getnframes())

    if width not in TYPECODES:
        raise SystemExit(f"{path.name}: {width * 8}bit の WAV は読めません。16 か 32 で書き出してください。")
    data = array(TYPECODES[width])
    data.frombytes(raw)
    if sys.byteorder == "big":
        data.byteswap()

    if channels == 1:
        return list(data), rate
    # Average the channels rather than taking one: a render panned even slightly
    # would otherwise lose level on the quiet side and flatten the envelope.
    mono = [sum(data[i : i + channels]) // channels for i in range(0, len(data) - channels + 1, channels)]
    return mono, rate


def measure(path: Path, frame_ms: int) -> dict:
    data, rate = samples_of(path)
    duration_ms = round(len(data) / rate * 1000)
    step = max(1, int(rate * frame_ms / 1000))
    peak = float(max((abs(v) for v in data), default=0)) or 1.0

    envelope = []
    for start in range(0, len(data), step):
        chunk = data[start : start + step]
        if not chunk:
            break
        # RMS, not peak: peak tracks transients and makes the mouth snap open on
        # a plosive. RMS follows how loud the syllable actually is.
        rms = (sum(v * v for v in chunk) / len(chunk)) ** 0.5 / peak
        envelope.append(0.0 if rms < NOISE_FLOOR else round(min(1.0, rms), 3))

    return {"durationMs": duration_ms, "frameMs": frame_ms, "envelope": envelope}


def main() -> int:
    if not 2 <= len(sys.argv) <= 3:
        print(__doc__)
        return 2
    path = Path(sys.argv[1])
    frame_ms = int(sys.argv[2]) if len(sys.argv) == 3 else DEFAULT_FRAME_MS
    result = measure(path, frame_ms)
    print(f"// {path.name}  {result['durationMs']}ms  {len(result['envelope'])} frames")
    print(f"durationMs: {result['durationMs']},")
    print(f"frameMs: {result['frameMs']},")
    print(f"envelope: {json.dumps(result['envelope'])},")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
