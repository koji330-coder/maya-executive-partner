# Jev Tool Router 評価ハーネス（実験）

TypeSafe の Jev を「次にどの Tool を使うか」の判定器として使えるかを、**本番から切り離して**測るための道具。
`chat.ts` の本番ルーティングには一切つながっていない。Tool も Gemini も D1 も呼ばない。

## 実行

```sh
# オフライン（ハーネスの動作確認。数字は Jev の評価ではない）
node --import ./server/scripts/jev-router/register.mjs server/scripts/jev-router/eval.ts

# Jev（要: typesafe.ts の API 対応を公式ドキュメントで埋めること、TYPESAFE_API_KEY）
TYPESAFE_API_KEY=... node --import ./server/scripts/jev-router/register.mjs \
  server/scripts/jev-router/eval.ts --router typesafe --variant both
```

結果は `results/<時刻>-<router>/` に `rows.jsonl`（1ケース1行）、`summary.json`、`report.md` で出る。`results/` は git に入らない。

型チェック: `npx tsc -p server/scripts/jev-router`

## ファイル

| ファイル | 中身 |
|---|---|
| `tools.ts` | 本番の ToolDeclaration をそのまま import し、name と description だけ取り出す（コピーではない） |
| `cases.ts` | 人工のテスト発話 57件（A 単一Tool / B none / C 紛らわしい / D follow-up / E adversarial） |
| `prompts.ts` | A. Minimal / B. Explicit の state と Choice question |
| `routers.ts` | router の共通形、confidence の検算式、オフライン用 dry-run |
| `typesafe.ts` | Jev への送信。**API 仕様が未確認のため未実装で、送信を拒否する** |
| `baseline.ts` | 現行 MAYA の正規表現による絞り込み（`chat.ts` の該当部分の snapshot） |
| `metrics.ts` / `report.ts` | 指標の計算とレポート |

## 安全上の約束

- テスト発話・商品名・数字はすべて架空。実データは入れない
- キーは環境変数 `TYPESAFE_API_KEY` だけ。ログにもレポートにも書かない
- 本番の Worker・D1・EAS には触れない
