# MAYA モーションベンチ

生成した差分フレームを、実装と同じまばたき間隔とリップシンク判定で動かして
確認するページ。素材を採用するかどうかの判断に使う。

**公開先（このURLを更新し続ける。新規発行しない）**

```
https://claude.ai/code/artifact/09659d87-a4af-4599-aaba-8b0c3193c7e3
```

## 何を確認できるか

- まばたきとリップシンクの実時間での見え方
- 口を開くしきい値を動かしたときの口の印象。パイプラインの口は2値なので、
  どの振幅で開くかが印象を決める
- 背景を変えたときの切り抜きの縁。暖色のシーンに載せたときのグレーかぶり
- 実測した合成マスクの位置。ステージに重ねて確認できる

判断そのものはページに残らない。気づいたことはチャットに書く。

## ポーズを1つ足す手順

### 1. 2枚生成する

採用したポーズ画像を親として `edit` に渡し、まばたき版と口を開けた版を作る。
同時版（目を閉じて口を開く）は合成で作れるので生成しない。
プロンプトの書き方と注意点は `docs/NANO_BANANA_PIPELINE.md` にある。

### 2. マスクを測る

closed と open のピクセル差分から重心と広がりを出し、半径を実測の1.5倍にする。
**ポーズごとに必ず測り直す。**構図が変わると口と目の位置が変わるため、流用すると
「OPENを選んでも口が閉じたままに見える」形でずれが出る。実績プロジェクトが
先生と生徒でマスクを共有して失敗した箇所。

### 3. フレームを書き出す

```bash
python3 tools/motion-bench/prepare_frames.py \
  --pose challenge \
  --master path/to/challenge_master.png \
  --blink  path/to/challenge_blink.png \
  --mouth  path/to/challenge_mouth_open.png \
  --both   path/to/challenge_both.png
```

`build/motion-bench/frames/challenge/` に4枚出る。生成背景がグレー以外なら
`--bg` で指定する。出力はビルド成果物なのでコミットしない。

### 4. マニフェストに足す

`bench.html` の `POSES` に1つ追加する。セレクタも状態マトリクスもマスク表も
自動で増える。

```js
{
  id: 'challenge',
  label: '挑発的',
  dir: 'frames/challenge',
  masks: {
    eyes: [
      { label: '左目（向かって左）', cx: 38.9, cy: 29.1, rx: 7.0, ry: 3.6, spread: '4.6 / 2.3' },
      { label: '右目（向かって右）', cx: 58.2, cy: 27.1, rx: 7.6, ry: 3.9, spread: '5.2 / 2.5' },
    ],
    mouth: [
      { label: '口', cx: 51.6, cy: 39.8, rx: 14.5, ry: 3.5, spread: '9.7 / 2.3' },
    ],
  },
}
```

### 5. 公開先を更新する

Claude に「モーションベンチを更新して」と頼む。上のURLを渡して更新するので、
リンクは変わらない。URLを渡さずに公開すると別のアーティファクトができてしまう。

公開するファイルは `bench.html` と、`build/motion-bench/frames/` 配下を
`frames/` として渡したもの。

## 実装と揃えてあるもの

ここがズレると、ページでの見え方とアプリでの見え方が食い違う。実装を変えたら
ページも直す。

| ページ側 | 実装側 |
| --- | --- |
| `envelope()` | `src/services/audio/clipManifest.ts` の `synthesizeEnvelope` |
| `HOLD_MS = 60` | `src/features/character/LipSyncController.ts` の `minHoldMs` |
| まばたき 3〜7秒・二度まばたき18% | `src/features/character/BlinkController.ts` |
| `CLIPS` の text と ms | `clipManifest.ts` の固定クリップ |

しきい値だけは実装と揃えていない。ページ側は2値用の単一しきい値で、実装は
`small` と `open` の2段階を持つ。素材が2値である間は、ページで決めた値を
実装の `openThreshold` に入れ、`smallThreshold` は同じ値にする。
