/**
 * Router eval cases. Every utterance, product, meeting and number here is made
 * up for the test — nothing is taken from real conversations, sales or logs, so
 * the whole file is safe to send to an outside API.
 *
 * `expected` is the one tool MAYA should call next. `acceptable` lists other
 * answers that are defensible; the report scores strictly on `expected` and
 * separately with `acceptable` allowed. `ambiguous` marks utterances where no
 * tool can be chosen with certainty from the state — a high confidence there is
 * the failure this eval is looking for.
 */

export type Category =
  | 'A_single'
  | 'B_none'
  | 'C_confusing'
  | 'D_followup'
  | 'E_adversarial'
  | 'P_personal'
  | 'X_context';

export interface Turn {
  role: 'user' | 'maya';
  text: string;
}

export interface RouterCase {
  id: string;
  category: Category;
  message: string;
  context?: Turn[];
  /** Facts already in the state (e.g. an id MAYA has already found). */
  known?: Record<string, string>;
  expected: string;
  acceptable?: string[];
  /**
   * Not needed to answer, but makes the answer the president's own (E2E v2).
   * Scored only where set.
   */
  useful?: string;
  usefulAcceptable?: string[];
  /** Whether the conversation already holds the facts the answer needs (E2E v2). Scored only where set. */
  contextSufficient?: boolean;
  ambiguous?: boolean;
  why?: string;
}

const BELL_CONTEXT: Turn[] = [
  { role: 'user', text: '卓上ベル（テスト商品）の売れ行きが最近気になってる' },
  { role: 'maya', text: '卓上ベルですね。何を確認しましょうか。' },
];

const FITNESS_CONTEXT: Turn[] = [
  { role: 'user', text: '最近体重は順調？' },
  { role: 'maya', text: '確認します。' },
];

const SALES_CONTEXT: Turn[] = [
  { role: 'user', text: '今月のAmazon売上どう？' },
  { role: 'maya', text: '今月はここまで売上 412,000円、粗利 98,000円です（テスト値）。' },
];

export const CASES: RouterCase[] = [
  // A. 明確な単一Tool
  { id: 'A01', category: 'A_single', message: '今日の体重と食事どうだった？', expected: 'fitlog_day' },
  { id: 'A02', category: 'A_single', message: '最近体脂肪は順調？', expected: 'fitlog_progress' },
  { id: 'A03', category: 'A_single', message: '先週の運動を振り返って', expected: 'fitlog_weekly' },
  { id: 'A04', category: 'A_single', message: 'ベンチプレスの前回記録は？', expected: 'fitlog_exercise' },
  {
    id: 'A05',
    category: 'A_single',
    message: 'この商品の在庫切れそう？',
    context: BELL_CONTEXT,
    expected: 'haksai_inventory',
    why: '「この商品」は直前の卓上ベル。',
  },
  { id: 'A06', category: 'A_single', message: '今月Amazonでいくら売れた？', expected: 'haksai_sales' },
  {
    id: 'A07',
    category: 'A_single',
    message: '競合が値下げしてる？',
    context: BELL_CONTEXT,
    expected: 'haksai_market',
    why: '商品は文脈で決まっている。haksai_market は query 必須なので文脈なしでは作らない。',
  },
  { id: 'A08', category: 'A_single', message: '前に値上げについて何て決めたっけ？', expected: 'search_memory' },
  { id: 'A09', category: 'A_single', message: '最近どんな会議した？', expected: 'voice_recent' },
  { id: 'A10', category: 'A_single', message: '価格改定について話した会議を探して', expected: 'voice_search' },
  {
    id: 'A11',
    category: 'A_single',
    message: 'その会議の決定事項を詳しく見せて',
    context: [
      { role: 'user', text: '価格改定の会議あった？' },
      { role: 'maya', text: '9月20日の「価格改定MTG（テスト）」が見つかりました。' },
    ],
    known: { recording_id: 'rec_test_001', title: '価格改定MTG（テスト）' },
    expected: 'voice_detail',
  },
  { id: 'A12', category: 'A_single', message: '最近の会議で出た宿題は？', expected: 'voice_actions' },
  { id: 'A13', category: 'A_single', message: '昨日はよく眠れてた？', expected: 'fitlog_day' },
  { id: 'A14', category: 'A_single', message: 'スクワットの自己ベストいくつだっけ', expected: 'fitlog_exercise' },
  { id: 'A15', category: 'A_single', message: 'パジャマの発注っていつまでにすればいい？', expected: 'haksai_inventory' },
  { id: 'A16', category: 'A_single', message: '9月に一番利益が出た商品は？', expected: 'haksai_sales' },
  { id: 'A17', category: 'A_single', message: '卓上ベルを1480円に下げたら粗利どうなる？', expected: 'haksai_market' },
  { id: 'A18', category: 'A_single', message: '採用について以前どんな方針にしたか確認したい', expected: 'search_memory' },

  // B. none
  { id: 'B01', category: 'B_none', message: '粗利率って何？', expected: 'none' },
  { id: 'B02', category: 'B_none', message: 'PFCって何？', expected: 'none' },
  { id: 'B03', category: 'B_none', message: 'RSIとは？', expected: 'none' },
  {
    id: 'B04',
    category: 'B_none',
    message: 'このアイデアどう思う？',
    context: [{ role: 'user', text: '消耗品を定期便にして、3回目から5%引きにするのを考えてる' }],
    expected: 'none',
    contextSufficient: true,
    why: 'アイデアの中身は state にある。意見だけで答えられる。',
  },
  { id: 'B05', category: 'B_none', message: '在庫回転率の考え方を教えて', expected: 'none' },
  {
    id: 'B06',
    category: 'B_none',
    message: '減量中のタンパク質は体重1kgあたりどれくらいが目安？',
    expected: 'none',
    useful: 'fitlog_day',
    usefulAcceptable: ['fitlog_progress'],
    why: '一般知識で答えられる。本人の体重と摂取量があれば「Gakkyなら何g」まで言える。',
  },
  { id: 'B07', category: 'B_none', message: 'Amazon広告のACoSって何を見ればいい？', expected: 'none' },
  { id: 'B08', category: 'B_none', message: '会議を短くするコツある？', expected: 'none' },
  { id: 'B09', category: 'B_none', message: 'おはよう', expected: 'none' },

  // C. 紛らわしいケース
  { id: 'C01', category: 'C_confusing', message: '昨日食べすぎた気がするんだけど、どう？', expected: 'fitlog_day' },
  { id: 'C02', category: 'C_confusing', message: '最近ちゃんと絞れてる？', expected: 'fitlog_progress' },
  {
    id: 'C03',
    category: 'C_confusing',
    message: '売れてる？',
    context: [{ role: 'user', text: 'Amazonの今月の動き、気になってる' }],
    expected: 'haksai_sales',
  },
  {
    id: 'C04',
    category: 'C_confusing',
    message: '前に話してた商品の在庫どう？',
    expected: 'search_memory',
    why: '商品名が state に無い。haksai_inventory は query 必須なので、先に記録から商品を特定する。',
  },
  {
    id: 'C05',
    category: 'C_confusing',
    message: 'この前の会議で決めた価格、今の競合と比べるとどう？',
    expected: 'voice_search',
    acceptable: ['search_memory'],
    why: '「会議で決めた」は VoiceBox の決定事項が一次情報。Journal に残っている可能性もあるので search_memory も許容。競合比較はその後。',
  },
  {
    id: 'C06',
    category: 'C_confusing',
    message: '体重のこと、前にMAYAと何か決めたっけ？',
    expected: 'search_memory',
    why: '体重の実測ではなく、過去の決定。現行の正規表現は「体重」で fitlog に寄せる。',
  },
  { id: 'C07', category: 'C_confusing', message: '在庫の話が出た会議ってあった？', expected: 'voice_search', why: '在庫数ではなく会議を探している。' },
  { id: 'C08', category: 'C_confusing', message: 'Amazonの売上目標、前に何て決めた？', expected: 'search_memory', why: '売上の実績ではなく過去の決定。' },

  // D. follow-up
  {
    id: 'D01',
    category: 'D_followup',
    message: 'じゃあ先週は？',
    context: FITNESS_CONTEXT,
    expected: 'fitlog_weekly',
    acceptable: ['fitlog_progress'],
    why: '「先週」は完了した1週間。fitlog_weekly がそのまま対応する。',
  },
  { id: 'D02', category: 'D_followup', message: 'じゃあ先月は？', context: SALES_CONTEXT, expected: 'haksai_sales', contextSufficient: false },
  {
    id: 'D03',
    category: 'D_followup',
    message: '2つ目のを詳しく',
    context: [
      { role: 'user', text: '最近の会議は？' },
      { role: 'maya', text: '3件あります。1) 採用面談（テスト）rec_test_010 2) 仕入先商談（テスト）rec_test_011 3) 週次定例（テスト）rec_test_012' },
    ],
    expected: 'voice_detail',
  },
  {
    id: 'D04',
    category: 'D_followup',
    message: '競合の価格は？',
    context: [
      { role: 'user', text: '卓上ベル（テスト商品）の在庫どう？' },
      { role: 'maya', text: '残り12日分です（テスト値）。発注期限は10月3日です。' },
    ],
    expected: 'haksai_market',
    contextSufficient: false,
  },
  {
    id: 'D05',
    category: 'D_followup',
    message: 'デッドリフトは？',
    context: [
      { role: 'user', text: 'ベンチプレスの前回記録は？' },
      { role: 'maya', text: '前回は80kg×5回でした（テスト値）。' },
    ],
    expected: 'fitlog_exercise',
    contextSufficient: false,
  },
  {
    id: 'D06',
    category: 'D_followup',
    message: 'じゃあうちの今月は？',
    context: [
      { role: 'user', text: '粗利率って何？' },
      { role: 'maya', text: '売上に対する粗利の割合です。' },
    ],
    expected: 'haksai_sales',
    why: '一般知識の話から、自社の実データへ移った。',
  },

  // E. adversarial — 同じ短文を文脈なし / ありで
  { id: 'E01', category: 'E_adversarial', message: '最近どう？', expected: 'none', ambiguous: true, why: '対象が無い。推測でTool を選ばず聞き返す。fitlog_progress の説明文に同じ文言があるので引っ張られやすい。' },
  { id: 'E02', category: 'E_adversarial', message: '最近どう？', context: FITNESS_CONTEXT, expected: 'fitlog_progress', contextSufficient: false },
  { id: 'E03', category: 'E_adversarial', message: 'あれどうなった？', expected: 'none', acceptable: ['search_memory'], ambiguous: true },
  {
    id: 'E04',
    category: 'E_adversarial',
    message: 'あれどうなった？',
    context: [{ role: 'user', text: '卓上ベル（テスト商品）、競合が値下げしたら追随するか考える' }],
    expected: 'haksai_market',
  },
  { id: 'E05', category: 'E_adversarial', message: '昨日のやつ見て', expected: 'none', ambiguous: true },
  {
    id: 'E06',
    category: 'E_adversarial',
    message: '昨日のやつ見て',
    context: [{ role: 'user', text: '昨日の仕入先との商談、録音しておいた' }],
    expected: 'voice_recent',
    acceptable: ['voice_search'],
    why: 'recording_id はまだ無い。一覧から探すのが次の一手。',
  },
  { id: 'E07', category: 'E_adversarial', message: '増えてる？', expected: 'none', ambiguous: true },
  { id: 'E08', category: 'E_adversarial', message: '増えてる？', context: FITNESS_CONTEXT, expected: 'fitlog_progress', contextSufficient: false },
  { id: 'E09', category: 'E_adversarial', message: '前よりいい？', expected: 'none', ambiguous: true },
  {
    id: 'E10',
    category: 'E_adversarial',
    message: '前よりいい？',
    context: [{ role: 'user', text: '今日ベンチプレスやってきた' }],
    expected: 'fitlog_exercise',
  },
  { id: 'E11', category: 'E_adversarial', message: '売れてない？', expected: 'none', acceptable: ['haksai_sales'], ambiguous: true },
  { id: 'E12', category: 'E_adversarial', message: '売れてない？', context: SALES_CONTEXT, expected: 'haksai_sales', contextSufficient: false },
  { id: 'E13', category: 'E_adversarial', message: 'あの会議のやつ', expected: 'voice_recent', acceptable: ['voice_search', 'none'], ambiguous: true },
  { id: 'E14', category: 'E_adversarial', message: 'この数字どう思う？', expected: 'none', ambiguous: true, why: '数字が state に無い。聞き返す。' },
  {
    id: 'E15',
    category: 'E_adversarial',
    message: 'この数字どう思う？',
    context: SALES_CONTEXT,
    expected: 'none',
    contextSufficient: true,
    why: '数字は直前の MAYA の返答にある。取得し直す必要は無い。',
  },
  {
    id: 'E16',
    category: 'E_adversarial',
    message: 'それって食べすぎ？',
    context: [
      { role: 'user', text: '今日の食事どうだった？' },
      { role: 'maya', text: '今日は 2,850kcal、P 120g / F 110g / C 330g でした（テスト値）。' },
    ],
    expected: 'none',
    contextSufficient: true,
    why: '必要な実データは state にある。',
  },

  // P. 答えに必須ではないが、本人のデータがあると答えが良くなる（E2E v2）
  { id: 'P01', category: 'P_personal', message: 'ジムに行くなら週何回くらいがいい？', expected: 'none', useful: 'fitlog_weekly', usefulAcceptable: ['fitlog_progress'] },
  { id: 'P02', category: 'P_personal', message: '減量のペースって週どれくらいが理想？', expected: 'none', useful: 'fitlog_progress' },
  { id: 'P03', category: 'P_personal', message: '睡眠を良くするコツある？', expected: 'none', useful: 'fitlog_day' },
  { id: 'P04', category: 'P_personal', message: 'お酒って週何回までならいい？', expected: 'none', useful: 'fitlog_day', usefulAcceptable: ['fitlog_weekly'] },
  { id: 'P05', category: 'P_personal', message: 'ベンチプレスを伸ばすコツは？', expected: 'none', useful: 'fitlog_exercise' },
  { id: 'P06', category: 'P_personal', message: '広告費って売上の何%くらいが目安？', expected: 'none', useful: 'haksai_sales' },
  { id: 'P07', category: 'P_personal', message: 'ネットショップの売上を伸ばすなら、何から手をつけるべき？', expected: 'none', useful: 'haksai_sales' },
  { id: 'P08', category: 'P_personal', message: '利益率を上げるには、何から見直すべき？', expected: 'none', useful: 'haksai_sales' },
  { id: 'P09', category: 'P_personal', message: '宿題を溜めないコツある？', expected: 'none', useful: 'voice_actions' },
  { id: 'P10', category: 'P_personal', message: '疲れが抜けないんだけど、何が原因だと思う？', expected: 'none', useful: 'fitlog_day', usefulAcceptable: ['fitlog_progress', 'fitlog_weekly'] },
  { id: 'P11', category: 'P_personal', message: '今週やることの優先順位ってどうつければいい？', expected: 'none', useful: 'voice_actions' },
  { id: 'P12', category: 'P_personal', message: '筋トレと有酸素、どっちを増やすべき？', expected: 'none', useful: 'fitlog_progress', usefulAcceptable: ['fitlog_weekly'] },

  // X. 必要な事実は直前の会話にある（E2E v2）
  {
    id: 'X01',
    category: 'X_context',
    message: 'じゃあ発注した方がいい？',
    context: [
      { role: 'user', text: '卓上ベル（テスト商品）の在庫どう？' },
      { role: 'maya', text: 'ゴールドが残り38個で約12日分（テスト値）。発注期限は10月3日、推奨発注数は120個です。' },
    ],
    expected: 'none',
    contextSufficient: true,
  },
  {
    id: 'X02',
    category: 'X_context',
    message: 'ジムの回数は足りてる？',
    context: [
      { role: 'user', text: '先週の運動を振り返って' },
      { role: 'maya', text: '先週はジム3回、有酸素2回で合計65分でした（テスト値）。筋トレ量は前週比+8%です。' },
    ],
    expected: 'none',
    contextSufficient: true,
  },
  {
    id: 'X03',
    category: 'X_context',
    message: 'どれから片付けるべき？',
    context: [
      { role: 'user', text: '最近の会議で出た宿題は？' },
      { role: 'maya', text: '2件です（テスト値）。1) 値上げ告知文を作る（期限9/30） 2) 仕入先に単価改定の回答をする（期限10/2）' },
    ],
    expected: 'none',
    contextSufficient: true,
  },
];
