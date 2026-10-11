import type Ionicons from '@expo/vector-icons/Ionicons';

/**
 * The tools MAYA can use in a consultation, with how to ask for each.
 *
 * Plain data, so the screen stays a list and the manual can be checked by a
 * test. `serverTools` are the names the server offers the model. One card may
 * explain several internal tools when they are one thing to the person using
 * MAYA: FIT LOG and VoiceBox are sources, not APIs the president has to learn.
 *
 * Only what is connected and measured is written as fact. Anything else says
 * "これから" and stops there, so the manual never promises a number MAYA cannot give.
 */

export interface ConnectedTool {
  id: string;
  /** Tool names on the server. Empty while the capability is not connected. */
  serverTools: string[];
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

export interface ConnectedToolGroup {
  id: string;
  label: string;
  description: string;
  tools: ConnectedTool[];
}

export const MEMORY_TOOL: ConnectedTool = {
  id: 'memory',
  serverTools: ['search_memory'],
  label: '過去の活動・判断',
  icon: 'library-outline',
  summary: 'CONTENT_LOG・Journal・保存した話題・判断から、以前の経緯を検索',
  can: [
    '各プロジェクトで実際に行ったこと、その理由、成果、失敗、学び',
    'Journalに残した、そのときの考え・動機・決めたこと',
    'MAYAに保存した話題と、判断の記録',
    '複数の記録を手がかりにした、プロジェクトの経緯や技術の再利用例',
  ],
  ask: [
    'CardScanを作ったきっかけは？',
    '前にMAYAの開発で、どんな問題を解決したっけ？',
    '過去のAmazon商品開発で、どんな試行錯誤をした？',
    '以前決めたことを、その理由も含めて教えて',
  ],
  notes: [
    '「前に」「以前」「作ったきっかけ」「覚えてる？」など、過去の記録を探したいと分かる聞き方をしてください',
    '記録に見つからないことは推測しません。CONTENT_LOGに「要確認」とある内容も、確定した事実としては答えません',
    'CONTENT_LOGはContent Hubから手動で同期します。新しい活動は、次に同期するまでMAYAには届きません',
    '読むだけです。MAYAから元のCONTENT_LOG・Journal・判断を変更することはできません',
  ],
  source: 'Content Hubから同期した各プロジェクトのCONTENT_LOGと、MAYAに保存したJournal・話題・判断。相談されたときに必要な記録だけをD1から読みます',
};

export const AMAZON_TOOLS: ConnectedTool[] = [
  {
    id: 'sales',
    serverTools: ['haksai_sales'],
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
      '月ごとの数字です。日ごと・期間を決めた広告の数字は、Amazonの広告の道具で調べます',
      '月の途中なら「9/20までの途中」と答えます。月全体の数字ではありません',
      '利益は、原価が確定した商品だけの計算です。未確定が残る月は「確定していない」と伝えます',
      '商品を指定した売上は、まだ出せません。上位の商品の中に出てきたものだけ、答えられます',
    ],
    source: 'HAKSAI Central。売上は Amazon の精算データ（SP-API。1時間ごとに自動取込）、広告費は広告API。答えに出てくる「データの最終日」を見てください',
  },
  {
    id: 'inventory',
    serverTools: ['haksai_inventory'],
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
    source: 'HAKSAI Central。FBA在庫・補充レポートを、SP-APIで1日4回（05:30・12:00・18:00・23:00）自動で更新しています。最新の1日分を読みます（在庫の増減の推移は、まだ読めません）。答えに出てくる「在庫の日付」を見てください',
  },
  {
    id: 'market',
    serverTools: ['haksai_market'],
    label: 'Amazonの競合と価格',
    icon: 'trending-up-outline',
    summary: '競合の値下げ、ランキングの動き、値下げしたときの1個あたりの粗利（履歴が無ければ Keepa から取る）',
    can: [
      '自社と、設定してある競合の、価格の変更とランキングの動き',
      '競合のランキングが大きく動いたときの記録',
      '出品者数、Buy Boxを持っているのがAmazonか他の出品者か、在庫切れ率、出品者数の直近の変化',
      '原価・FBA手数料・紹介料から、1個あたりの粗利。価格を言うと、その価格にしたときの粗利と、同じ粗利を保つのに必要な販売数の増え方',
    ],
    ask: [
      '卓上ベルの競合が値下げしてるけど、追随すべき？',
      '卓上ベルを690円にしたら、粗利はどうなる？',
      '卓上ベルの競合のランキングは動いてる？',
      '卓上ベルの競合は在庫切れしてない？',
    ],
    notes: [
      '商品名が要ります。履歴がまだ無い、または3日以上前のときは、その場で Keepa から取ります（1商品4トークン。1回20まで、1日300まで）。取れなかったときは、理由を言って、保存済みのもので答えます',
      '出品者数やBuy Boxの持ち主は、直近の取得時点の1点です。推移が分かるのは出品者数だけです',
      '価格は Keepa の新品価格です。クーポンやポイントの値引きは入っていません',
      'ランキングは販売数ではありません。競合の値下げと売上の減りが同じ時期でも、原因とは言い切れません',
      '粗利は概算です。広告費・返品・消費税と、販売数がどう変わるかは入っていません',
      'Keepa の取得と保存以外は、読むだけです。発注や価格の変更は、Mayaからはできません',
    ],
    source: 'HAKSAI Central。Keepa の履歴を保存したもの（毎朝の競合追跡と、必要なときの取得）。答えに出てくる「取得日」を見てください',
  },
  {
    id: 'ads',
    serverTools: ['haksai_ads'],
    label: 'Amazonの広告',
    icon: 'megaphone-outline',
    summary: '任意の日・任意の期間（最大190日）の広告費・ACOS・広告経由の売上と、広告費の大きい商品・キャンペーン',
    can: [
      '1日だけでも、期間（最大190日）でも、広告費・広告経由の売上・注文数・クリック数・ACOS',
      '全体の推移（短い期間は日ごと、3か月までは週ごと、それより長いと月ごと）',
      '広告費・売上・注文数・ACOSの順で並べた、上位の商品と、広告費の大きいキャンペーン（予算に届いた日数つき）',
      '商品（ASIN）を指定すると、その商品の広告実績と、紐付くキャンペーン、検索語の上位',
    ],
    ask: [
      '昨日の広告費はいくら？',
      '10/1〜10/6の広告費の合計と、広告費が大きい上位5商品は？',
      '先週のACOSが高い商品を教えて',
      'B0FXTQPGSB の広告のACOSは？',
    ],
    notes: [
      '商品を決めないと、全商品の合計と上位です。商品名だけで指定するときは、先に商品を調べて ASIN を使います',
      '広告経由の売上・注文は、広告がクリックされてから7日間の値です。直近の数日は、あとから増えることがあります',
      'ACOS は、広告経由の売上に対する広告費の比率です。全体の売上に対する割合ではありません',
      '広告データのある日だけです。取込が届いていない日は、答えに「ない」と書きます',
      '検索語も、広告APIから毎日自動で取り込んでいます。ただし、Amazonが保持する直近約60日分までです',
      '読むだけです。広告の設定や入札の変更は、Mayaからはできません',
    ],
    source: 'HAKSAI Central。広告API（毎日 06:45 と 18:45 に自動取込。2026年9月6日より前は手動取込の値を含みます）。答えに出てくる「期間」と「注意」を見てください',
  },
  {
    id: 'forecast',
    serverTools: ['haksai_forecast'],
    label: 'Amazonの月末の見立て',
    icon: 'calendar-outline',
    summary: '今月の売上・粗利・営業利益の月末の見込みと、目標（月300万円）までに必要な1日の売上',
    can: [
      '今月の売上・粗利・営業利益（粗利−広告費）の、月末の見込みと、ふつうの振れ幅',
      '売上目標までの残りと、残りの日に必要な1日の売上、届く見込み',
      'いまの勢い（曜日の傾向と、直近2週）から見た、1日あたりの売上の見込み',
    ],
    ask: [
      '今月の月末は、どこに着地しそう？',
      '今月の売上目標に届きそう？',
      '売上目標まで、あと1日いくら売ればいい？',
    ],
    notes: [
      '今月だけです。過去の月の確定値は、Amazonの売上の道具で調べます',
      '直近8週の曜日の傾向と、直近2週の勢いからの見積もりで、保証ではありません。過去の検証では、月末の売上の誤差は平均3.7%でした',
      '在庫の欠品による取りこぼしは、まだ入っていません',
      '営業利益は、粗利から広告費を引いた額です（売上画面の営業利益は、固定費も引くため、別の数字です）',
    ],
    source: 'HAKSAI Central。売上は Amazon の精算データ（毎時）、広告費は広告API。答えに出てくる「データの最終日」を見てください',
  },
  {
    id: 'adchanges',
    serverTools: ['haksai_ad_changes'],
    label: 'Amazonの広告の変更と効果',
    icon: 'git-compare-outline',
    summary: '広告の設定を変えた記録と、変更ごとの効果測定（前7日と後7日の比較）',
    can: [
      '日予算・停止・入札・掲載位置・除外キーワード・キーワードやターゲットの追加と削除の、変更の一覧',
      '変更ごとの効果測定（改善・悪化・変化なし・判定できない。測定中・暫定・確定の状態つき）',
      'キャンペーンや商品を決めての絞り込み',
    ],
    ask: [
      '最近、広告をいじった？',
      '先週の広告の変更は、効いてる？',
      '卓上ベルの広告の調整の効果を教えて',
    ],
    notes: [
      '広告の設定をHAKSAIが1日3回読み取って、前回との差から検知します。検知を始めたのは2026年10月7日からで、それ以前の変更は、自動では分かりません',
      '効果は、変更の前7日と後7日を、他のキャンペーンの増減で補正して比べます。後7日がそろうまで（8日後まで）は「測定中」、売上の確定を待つ間（15日後まで）は「暫定」です',
      '同じキャンペーンに別の変更が重なっていると、切り分けられません。そのときは、そう答えます',
      '読むだけです。広告の設定の変更は、Mayaからはできません',
    ],
    source: 'HAKSAI Central。広告APIの設定の取得（読み取りのみ。1日3回）と、広告の日次の実績。変更の時刻は、最大6時間の誤差があります',
  },
];

export const FITLOG_TOOL: ConnectedTool = {
  id: 'fitlog',
  serverTools: ['fitlog_day', 'fitlog_progress', 'fitlog_weekly', 'fitlog_exercise', 'fitlog_nights', 'fitlog_night_danger'],
  label: 'FIT LOG',
  icon: 'fitness-outline',
  summary: '体調・食事・運動・帰宅支援の記録を、日付・期間・種目から確認',
  can: [
    '指定日の睡眠・飲酒・腹囲・食事の質・歩数・体組成・運動',
    '最近の体重・体脂肪・実測TDEE・筋力の変化',
    '直前に完了した1週間の運動・食事・体重・自己ベスト',
    '指定した筋トレ種目の前回記録・自己ベスト・推定1RM',
    '帰宅支援（飲み会モード）の夜ごとの記録（量・結果・帰り方・費用・敗因）',
    '帰宅支援の「危険ライン」（超えると乗り過ごしやすい飲酒量・ペース）と今年の帰宅費用',
  ],
  ask: [
    '9/18日のコンディションは？',
    '最近、体重と筋力はどう？',
    '先週の運動を振り返って',
    'ベンチプレスの前回の筋トレ記録は？',
    '今日はどれくらい歩いた？',
    '最近、飲み会でどれくらい乗り過ごしてる？',
    '自分の危険ラインってどれくらい？',
  ],
  notes: [
    '読むだけです。MAYAから記録の追加・変更・削除はできません',
    '体の写真と、FIT LOG側のAIコメントは読みません',
    '記録が無い項目を0や「問題なし」とは扱わず、医療的な診断もしません',
    '歩数は、複数の提供元（スマホ本体・スマートウォッチ等）による二重計上を解消済みです（2026-09-27）',
    '帰宅支援の記録には、乗り過ごした先や降りた駅の名前が含まれます（本人の同意のもと、2026-09-30）',
    '帰宅支援の危険ラインは自分の記録からの目安で、悪い夜が3晩たまるまでは仮の値です',
  ],
  source: 'FIT LOG。相談されたときに、専用APIから必要な日・期間だけを読みます',
};

export const VOICEBOX_TOOL: ConnectedTool = {
  id: 'voicebox',
  serverTools: ['voice_recent', 'voice_search', 'voice_detail', 'voice_actions'],
  label: 'VoiceBox',
  icon: 'mic-outline',
  summary: '音声メモ・会議の要約から、話したこと・決定事項・やることを確認',
  can: [
    '最近の音声メモ・会議の、日付・題名・要点・参加者',
    '話題や参加者を手がかりにした会話の検索',
    '会話1件の決定事項・やること・論点',
    '期間内の会話から出た、担当・期限つきのやること',
  ],
  ask: [
    '最近の音声メモと会議録音は？',
    '価格改定について話した音声メモを探して',
    '昨日の商談で決めたことは？',
    '会議の録音で出たやることをまとめて',
  ],
  notes: [
    '読むのはVoiceBoxで採用した要約と議事録です。音声と文字起こし原文は持っていません',
    '最後の取り込みが古い場合は、それより新しい会話が未着かもしれないと伝えます',
    '会話から出た「やること」が完了したかどうかは分かりません',
    '読むだけです。VoiceBoxの記録は変更しません',
  ],
  source: 'VoiceBox。相談されたときに、読み取り専用の窓から要約・議事録だけを読みます',
};

export const RECORD_TOOLS: ConnectedTool[] = [FITLOG_TOOL, VOICEBOX_TOOL];

export const TOOL_GROUPS: ConnectedToolGroup[] = [
  {
    id: 'memory',
    label: '過去の記録',
    description: '普段の活動や判断を、必要な相談のときだけ探します。',
    tools: [MEMORY_TOOL],
  },
  {
    id: 'amazon',
    label: 'Amazon運営',
    description: '数字の性質と注意点が違うため、売上・在庫・市場を分けています。',
    tools: AMAZON_TOOLS,
  },
  {
    id: 'records',
    label: '健康・会話の記録',
    description: 'アプリごとに1枚。中の道具はMAYAが質問に合わせて選びます。',
    tools: RECORD_TOOLS,
  },
];

export const CONNECTED_TOOLS = TOOL_GROUPS.flatMap((group) => group.tools);

/** The ones a person can use today. */
export const READY_TOOLS = CONNECTED_TOOLS.filter((tool) => tool.serverTools.length > 0);
