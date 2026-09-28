/**
 * Stand-in tool results for the end-to-end eval. Every number, product and
 * meeting is made up, and nothing here reaches HAKSAI, FIT LOG, VoiceBox or D1.
 * The shapes are loose imitations of the real results: enough for MAYA to
 * answer from, not a contract.
 *
 * The same fixture answers whichever pipeline asked, so the only difference
 * between the pipelines' answers is how the data was fetched.
 */
import type { ToolCall } from '@/services/llm/geminiClient';

export const EVAL_TODAY = '2026-09-28';
const YESTERDAY = '2026-09-27';

function fitlogDay(date: string) {
  const yesterday = date === YESTERDAY;
  return {
    対象日: date,
    データの出所: 'FIT LOG（テストデータ）',
    体重: { 値: yesterday ? '73.1kg' : '72.4kg', 測定日: date },
    体脂肪率: { 値: yesterday ? '18.9%' : '18.6%', 測定日: date },
    睡眠: yesterday ? '5時間10分（途中で2回起きた）' : '7時間05分',
    飲酒: yesterday ? 'ビール2杯' : 'なし',
    食事: yesterday
      ? { 合計: '3,120kcal', P: '105g', F: '128g', C: '372g', メモ: '夜に揚げ物と締めのラーメン' }
      : { 合計: '2,150kcal', P: '142g', F: '61g', C: '248g' },
    ジム: yesterday ? '記録なし' : 'ベンチプレス 80kg×5×3、ラットプル 60kg×10×3',
    歩数: yesterday ? '4,210歩' : '9,870歩',
  };
}

const FIXTURES: Record<string, (args: Record<string, unknown>) => unknown> = {
  search_memory: (args) => ({
    検索語: args.keywords ?? [],
    件数: 2,
    記録: [
      { 日付: '2026-08-19', 種類: 'decision', 内容: '消耗品カテゴリは10月から一律5%値上げ。広告費の上昇分を吸収するため。' },
      { 日付: '2026-07-02', 種類: 'journal', 内容: '採用は当面見送り。外注で回るうちは固定費を増やさない。売上目標は月450万円。' },
    ],
  }),
  haksai_inventory: (args) => ({
    検索語: args.query ?? '',
    商品: '卓上ベル（テスト商品）',
    バリエーション: [
      { 色: 'ゴールド', 在庫: 38, 日販: 3.1, 在庫日数: 12, 発注期限: '2026-10-03', 推奨発注数: 120 },
      { 色: 'シルバー', 在庫: 95, 日販: 1.4, 在庫日数: 68, 発注期限: null, 推奨発注数: 0 },
    ],
  }),
  haksai_sales: (args) => {
    const month = typeof args.month === 'string' ? args.month : '2026-09';
    const last = month === '2026-08';
    return {
      月: month,
      売上: last ? '3,870,000円' : '4,120,000円（28日時点）',
      粗利: last ? '905,000円' : '981,000円',
      広告費: last ? '402,000円' : '455,000円',
      上位: [
        { 商品: '卓上ベル（テスト商品）', 売上: last ? '1,010,000円' : '1,180,000円' },
        { 商品: 'パジャマ メンズ（テスト商品）', 売上: last ? '880,000円' : '760,000円' },
      ],
    };
  },
  haksai_market: (args) => ({
    検索語: args.query ?? '',
    商品: '卓上ベル（テスト商品）',
    自社価格: '1,680円',
    競合: [{ 名前: '競合A（テスト）', 価格推移: '1,780円 → 1,480円（9月21日に値下げ）' }],
    ランキング: '9月上旬 2,100位 → 直近 3,400位',
    試算: args.new_price
      ? { 新価格: `${String(args.new_price)}円`, '1個あたり粗利': '298円 → 142円', 同じ粗利に必要な販売数: '約2.1倍' }
      : null,
  }),
  fitlog_day: (args) => fitlogDay(typeof args.date === 'string' ? args.date : EVAL_TODAY),
  fitlog_progress: () => ({
    期間: '直近28日',
    体重: '74.2kg → 72.4kg（-1.8kg）',
    脂肪量: '14.4kg → 13.5kg',
    除脂肪量: '59.8kg → 58.9kg',
    実測TDEE: '約2,480kcal',
    体脂肪目標: '目標15% まで あと約3.6pt',
  }),
  fitlog_weekly: () => ({
    週: '2026-09-21〜2026-09-27',
    ジム: '3回',
    筋トレ量: '前週比 +8%',
    有酸素: '2回・合計65分',
    食事記録: '7日中6日',
    体重: '週平均 72.9kg（前週 73.4kg）',
    自己ベスト: 'スクワット 110kg×3',
  }),
  fitlog_exercise: (args) => ({
    種目: args.name ?? '',
    前回: '2026-09-26 80kg×5×3',
    自己ベスト: '85kg×3（2026-09-12）',
    推定1RM推移: '92kg → 95kg（28日）',
  }),
  voice_recent: () => ({
    件数: 3,
    会話: [
      { recording_id: 'rec_test_012', 日付: '2026-09-27', 題名: '仕入先商談（テスト）', 要点: '卓上ベルの単価を3%下げる提案を受けた' },
      { recording_id: 'rec_test_001', 日付: '2026-09-20', 題名: '価格改定MTG（テスト）', 要点: '消耗品の値上げ幅を5%で確定' },
      { recording_id: 'rec_test_010', 日付: '2026-09-18', 題名: '採用面談（テスト）', 要点: '業務委託で様子を見る' },
    ],
  }),
  voice_search: (args) => ({
    検索語: args.keywords ?? [],
    会話: [
      { recording_id: 'rec_test_001', 日付: '2026-09-20', 題名: '価格改定MTG（テスト）', 決定事項: ['消耗品は10月から5%値上げ', '卓上ベルは1,680円を維持'] },
    ],
  }),
  voice_detail: (args) => ({
    recording_id: args.recording_id ?? '',
    題名: '価格改定MTG（テスト）',
    決定事項: ['消耗品は10月から5%値上げ', '卓上ベルは1,680円を維持し、競合が1,500円を切ったら再検討'],
    やること: [{ 内容: '値上げ告知文を作る', 担当: '社長', 期限: '2026-09-30' }],
  }),
  voice_actions: () => ({
    期間: '直近14日',
    やること: [
      { 内容: '値上げ告知文を作る', 担当: '社長', 期限: '2026-09-30', 会話: '価格改定MTG（テスト）' },
      { 内容: '仕入先に単価改定の回答をする', 担当: '社長', 期限: '2026-10-02', 会話: '仕入先商談（テスト）' },
    ],
  }),
};

export function runFixtureTool(call: ToolCall): unknown {
  const fixture = FIXTURES[call.name];
  if (!fixture) return { error: `評価用の道具が無い: ${call.name}` };
  return fixture(call.args ?? {});
}

export const FIXTURE_TOOL_NAMES = Object.keys(FIXTURES);
