# Jev Tool Router 評価ハーネス（実験）

TypeSafe の Jev を「次にどの Tool を使うか」の判定器として使えるかを、**本番から切り離して**測るための道具。
`chat.ts` の本番ルーティングには一切つながっていない。Tool も Gemini も D1 も呼ばない。

## 実行

```sh
# オフライン（ハーネスの動作確認。数字は Jev の評価ではない）
node --import ./server/scripts/jev-router/register.mjs server/scripts/jev-router/eval.ts

# Jev（57件 × 2種類で 114 リクエスト、約 $0.01）
NODE_USE_ENV_PROXY=1 node --no-warnings --import ./server/scripts/jev-router/register.mjs \
  server/scripts/jev-router/eval.ts --router typesafe --variant both
```

キーはクラウド環境の「API認証情報」（`api.typesafe.ai` 宛てに `Authorization: Bearer` を付ける）に置いてあり、
このプロセスからは見えない。Node の組み込み fetch はプロキシを通らないため `NODE_USE_ENV_PROXY=1` が要る
（無いと 403 "Must supply an API key"）。手元の PC で動かすときは `TYPESAFE_API_KEY` を環境変数で渡す。

2026-09-28 の実行結果は `reports/` に残してある。結果は `results/<時刻>-<router>/` に `rows.jsonl`（1ケース1行）、`summary.json`、`report.md` で出る。`results/` は git に入らない。

型チェック: `npx tsc -p server/scripts/jev-router`

## ファイル

| ファイル | 中身 |
|---|---|
| `tools.ts` | 本番の ToolDeclaration をそのまま import し、name と description だけ取り出す（コピーではない） |
| `cases.ts` | 人工のテスト発話 57件（A 単一Tool / B none / C 紛らわしい / D follow-up / E adversarial） |
| `prompts.ts` | A. Minimal / B. Explicit の state と Choice question |
| `routers.ts` | router の共通形、confidence の検算式、オフライン用 dry-run |
| `typesafe.ts` | Jev への送信（公式 API リファレンスに沿う。モデルは `jev-1.13.0` に固定） |
| `baseline.ts` | 現行 MAYA の正規表現による絞り込み（`chat.ts` の該当部分の snapshot） |
| `metrics.ts` / `report.ts` | 指標の計算とレポート |

## 安全上の約束

- テスト発話・商品名・数字はすべて架空。実データは入れない
- キーは環境変数 `TYPESAFE_API_KEY` だけ。ログにもレポートにも書かない
- 本番の Worker・D1・EAS には触れない

## E2E 評価（Gemini 接続）

Jev をルーター単体でなく、MAYA の応答の流れに組み込んだときの速さ・費用・品質を、現行と同じケースで並べて測る。

```sh
NODE_USE_ENV_PROXY=1 node --no-warnings --experimental-transform-types \
  --import ./server/scripts/jev-router/register.mjs \
  server/scripts/jev-router/e2e.ts [--cases A01,B01] [--limit N] [--threshold 0.9] [--budget-usd 1] [--no-judge]
```

- `--experimental-transform-types` は `geminiClient.ts` の構文（コンストラクタ引数のプロパティ）を Node に読ませるため
- **current**: `chat.ts` と同じ絞り込み → Gemini が道具を決めて呼ぶ（道具を使うと2往復）
- **jev**: Jev（Minimal）が confidence ≥ しきい値で
  - `none` → Gemini を道具なしで1往復
  - 引数をコードで埋められる道具（`fitlog_day` の今日/昨日、`haksai_sales` の今月/先月、`fitlog_progress` など）→ サーバーが先に実行し、結果をプロンプトに入れて Gemini 1往復
  - それ以外 → current にそのまま回す（Jev の時間と費用は加算）
- 道具の結果は `fixtures.ts` の架空データ。本物の HAKSAI / FIT LOG / VoiceBox / D1 には触れない
- 品質は、返事の形の検証、正しいデータを取ったか、Gemini によるブラインド比較（`judge.ts`、順番はケースごとに入れ替え）
- `--budget-usd` を超えたら途中で止まる（既定 $1）
