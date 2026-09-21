import type Ionicons from '@expo/vector-icons/Ionicons';

/**
 * The tools MAYA can use in a consultation, with how to ask for each.
 *
 * Plain data, so the screen stays a list and the manual can be checked by a
 * test. `serverTool` is the name the server offers the model (server/src/haksai.ts);
 * a test keeps the two from drifting apart, and keeps every example question one
 * the server will actually turn into a tool call.
 *
 * Only what is connected and measured is written as fact. Anything else says
 * "これから" and stops there, so the manual never promises a number MAYA cannot give.
 */

export interface ConnectedTool {
  id: string;
  /** The tool's name on the server. Null while it is not connected. */
  serverTool: string | null;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** One line, shown while the card is closed. */
  summary: string;
  /** What comes back. */
  can: string[];
  /** Questions that work. Each one names what it needs, because the wording is the trigger. */
  ask: string[];
  /** What to know before trusting the answer. */
  notes: string[];
  /** Where the numbers come from, and how fresh they can be. */
  source: string;
}

export const CONNECTED_TOOLS: ConnectedTool[] = [
  {
    id: 'sales',
    serverTool: 'haksai_sales',
    label: 'Amazonの売上',
    icon: 'stats-chart-outline',
    summary: '月ごとの売上・粗利・広告費と、売れている商品',
    can: [
      '月の売上（税込）、Amazon手取、粗利、営業利益',
      '販売数、返品数、広告費、広告経由の売上、ACOS',
      '売れている上位の商品（売上・販売数・粗利・広告費の順に並べ替え）',
    ],
    ask: [
      '9月の売上を教えて',
      '先月の粗利はいくら？',
      '今月売れている商品を5つ教えて',
      '8月の広告費とACOSは？',
    ],
    notes: [
      '月ごとの数字です。日ごと・週ごとは、まだ出せません',
      '月の途中なら「9/20までの途中」と答えます。月全体の数字ではありません',
      '利益は、原価が確定した商品だけの計算です。未確定が残る月は「確定していない」と伝えます',
      '商品を指定した売上は、まだ出せません。上位の商品の中に出てきたものだけ、答えられます',
    ],
    source: 'HAKSAI Central。売上レポートの手動取込です。答えに出てくる「データの最終日」を見てください',
  },
  {
    id: 'inventory',
    serverTool: 'haksai_inventory',
    label: 'Amazonの在庫・発注',
    icon: 'cube-outline',
    summary: '在庫、日販、発注期限、推奨発注数（サイズ・色ごと）',
    can: [
      '商品名で探して、サイズ・色ごとの在庫数と日販',
      '在庫が何日もつか、発注期限、売り切れる予定日',
      '推奨発注数（急ぎのものだけを表にして、余裕のあるものは一行にまとめます）',
    ],
    ask: [
      'パジャマ メンズの在庫、発注はどれが急ぎ？',
      '卓上ベルはいつまでに発注すればいい？',
      'エアコン掃除ブラシの在庫はどれくらい残ってる？',
    ],
    notes: [
      '商品名が要ります。「欠品しそうな商品は？」のような、名前のない聞き方は、まだ出せません',
      '種類が多い商品は、売れている順に15種類までを調べます。省いた数は答えに書きます',
      '推奨発注数は計算値です。最小ロットと、発注済みでまだ届いていない数は入っていません',
      '仕入れ区分が未設定の商品は、リードタイムを20日として計算します',
      '読むだけです。発注や変更は、Mayaからはできません',
    ],
    source: 'HAKSAI Central。FBA在庫レポートの手動取込で、1日分だけです。在庫の推移は見られません',
  },
  {
    id: 'market',
    serverTool: 'haksai_market',
    label: 'Amazonの競合と価格',
    icon: 'trending-up-outline',
    summary: '競合の値下げ、ランキングの動き、値下げしたときの1個あたりの粗利',
    can: [
      '自社と、設定してある競合の、価格の変更とランキングの動き',
      '競合のランキングが大きく動いたときの記録',
      '原価・FBA手数料・紹介料から、1個あたりの粗利。価格を言うと、その価格にしたときの粗利と、同じ粗利を保つのに必要な販売数の増え方',
    ],
    ask: [
      '卓上ベルの競合が値下げしてるけど、追随すべき？',
      '卓上ベルを690円にしたら、粗利はどうなる？',
      '卓上ベルの競合のランキングは動いてる？',
    ],
    notes: [
      '商品名が要ります。まだ Keepa の履歴を取っていない商品は「未取得」と答えます。今は、競合が設定されていて毎朝追跡している商品が中心です',
      '価格は Keepa の新品価格です。クーポンやポイントの値引きは入っていません',
      'ランキングは販売数ではありません。競合の値下げと売上の減りが同じ時期でも、原因とは言い切れません',
      '粗利は概算です。広告費・返品・消費税と、販売数がどう変わるかは入っていません',
      '読むだけです。Keepa は呼びません（履歴の取得は、まだ Maya からはできません）',
    ],
    source: 'HAKSAI Central。Keepa の履歴を保存したもの（毎朝の競合追跡など）。答えに出てくる「取得日」を見てください',
  },
  {
    id: 'ads',
    serverTool: null,
    label: 'Amazonの広告',
    icon: 'megaphone-outline',
    summary: '広告費の無駄や、ACOSが悪化した商品を見つけます',
    can: [],
    ask: [],
    notes: ['HAKSAI Centralには、広告のデータがあります。Mayaへの接続は、まだです'],
    source: '接続したら、ここに書きます',
  },
];

/** The ones a person can use today. */
export const READY_TOOLS = CONNECTED_TOOLS.filter((tool) => tool.serverTool !== null);
