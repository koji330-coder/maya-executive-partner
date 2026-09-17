"""表情差分がマスターと同じ位置・同じ大きさで出ているかを測る。

表情は切り抜き全体を差し替えるので、まばたきや口と違ってマスクで隠せない。
ずれはそのまま画面に出る。生成のたびにこれを通し、通ったものだけ表情の出来を見る。

判定は2段。

1. 顔全体の当てはめ。拡縮と平行移動が0付近か。
2. 目の帯と口の帯を別々に当てはめ、両者が同じ答えを返すか。
   返さないなら顔の縦横比そのものが変わっている。その場合、平行移動と拡縮を
   どう組み合わせても重ならないので、合成では直せない。プロンプトで直す。

ランドマークは検出しない。暗い行や列を探す方法は髪を拾って当てにならなかった。
代わりに、位置合わせと同じ相関計算を領域ごとに回している。

  python3 tools/measure_drift.py \
      --master assets/reference/maya-face-reference.png \
      --candidate assets/reference/candidates/challenge-02.png
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# 合格とみなす範囲。緩めるとアプリ側で飛びが見える。
MAX_SCALE_DEV = 0.02      # スケールが 1.00 からどれだけ離れてよいか
MAX_OFFSET_PX = 12        # 平行移動の許容量
MAX_REGION_SCALE_GAP = 0.03   # 目の帯と口の帯で許すスケール差
MAX_REGION_DY_GAP = 14        # 目の帯と口の帯で許す縦位置の差


def fit(master: Path, cand: Path, box: tuple[int, int, int, int], width: int = 362):
    """box（マスター座標）を手がかりに、拡縮と平行移動の最良の組み合わせを探す。"""
    m = Image.open(master).convert("L")
    k = m.width / width
    a = np.asarray(m.resize((width, round(m.height * width / m.width)), Image.LANCZOS)).astype(np.float32)
    c = Image.open(cand).convert("L")

    x0, y0, x1, y1 = (int(v / k) for v in box)
    target = a[y0:y1, x0:x1]
    if target.size == 0:
        raise SystemExit(f"枠が空です: {box}")

    best = None
    for sc in np.arange(0.80, 1.201, 0.01):
        w2 = int(round(width * sc))
        h2 = int(round(c.height * w2 / c.width))
        bs = np.asarray(c.resize((w2, h2), Image.LANCZOS)).astype(np.float32)
        for dy in range(-70, 131):
            for dx in range(-60, 61):
                yy, xx = y0 + dy, x0 + dx
                if yy < 0 or xx < 0 or yy + target.shape[0] > h2 or xx + target.shape[1] > w2:
                    continue
                r = float(np.abs(target - bs[yy:yy + target.shape[0], xx:xx + target.shape[1]]).mean())
                if best is None or r < best[0]:
                    best = (r, dx * k, dy * k, float(sc))
    if best is None:
        raise SystemExit("当てはめ先が見つかりません。枠か探索範囲を見直してください。")
    return best


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--master", required=True, type=Path)
    ap.add_argument("--candidate", required=True, type=Path)
    ap.add_argument("--face", type=int, nargs=4, default=[330, 320, 710, 660],
                    metavar=("X0", "Y0", "X1", "Y1"), help="マスター上の顔枠")
    ap.add_argument("--eyes", type=int, nargs=4, default=[350, 340, 700, 450],
                    metavar=("X0", "Y0", "X1", "Y1"), help="マスター上の目の帯")
    ap.add_argument("--mouth", type=int, nargs=4, default=[430, 520, 660, 640],
                    metavar=("X0", "Y0", "X1", "Y1"), help="マスター上の口の帯")
    args = ap.parse_args()

    r_f, dx_f, dy_f, sc_f = fit(args.master, args.candidate, tuple(args.face))
    r_e, dx_e, dy_e, sc_e = fit(args.master, args.candidate, tuple(args.eyes))
    r_m, dx_m, dy_m, sc_m = fit(args.master, args.candidate, tuple(args.mouth))

    print(f"顔全体   scale={sc_f:.2f}  dx={dx_f:+.0f}  dy={dy_f:+.0f}   残差 {r_f:.2f}")
    print(f"目の帯   scale={sc_e:.2f}  dx={dx_e:+.0f}  dy={dy_e:+.0f}   残差 {r_e:.2f}")
    print(f"口の帯   scale={sc_m:.2f}  dx={dx_m:+.0f}  dy={dy_m:+.0f}   残差 {r_m:.2f}")

    scale_gap = abs(sc_e - sc_m)
    dy_gap = abs(dy_e - dy_m)
    print(f"\n目と口の食い違い   スケール差 {scale_gap:.2f}   縦位置差 {dy_gap:.0f}px")

    checks = [
        ("スケール", abs(sc_f - 1.0) <= MAX_SCALE_DEV,
         f"{sc_f:.2f}（許容 1.00±{MAX_SCALE_DEV}）"),
        ("位置", max(abs(dx_f), abs(dy_f)) <= MAX_OFFSET_PX,
         f"dx {dx_f:+.0f} dy {dy_f:+.0f}（許容 ±{MAX_OFFSET_PX}px）"),
        ("顔の縦横比", scale_gap <= MAX_REGION_SCALE_GAP and dy_gap <= MAX_REGION_DY_GAP,
         f"スケール差 {scale_gap:.2f} / 縦位置差 {dy_gap:.0f}px"
         f"（許容 {MAX_REGION_SCALE_GAP} / {MAX_REGION_DY_GAP}px）"),
    ]
    print()
    ok = True
    for name, passed, detail in checks:
        print(f"  {'合格' if passed else '不合格'}  {name:10s} {detail}")
        ok &= passed
    print()
    if ok:
        print("通過。表情の出来を見る段階に進めます。")
    else:
        print("差し戻し。位置が揃っていないので、表情の良し悪しを見ても意味がありません。")
        if scale_gap > MAX_REGION_SCALE_GAP or dy_gap > MAX_REGION_DY_GAP:
            print("縦横比が不合格です。平行移動と拡縮では直せないので、プロンプトで直します。")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
