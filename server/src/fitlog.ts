import type { ToolCall, ToolDeclaration } from '@/services/llm/geminiClient';
import type { Env } from './env';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PROGRESS_WINDOWS = [14, 28, 42] as const;
const TDEE_WINDOWS = [30, 90, 180] as const;

type ProgressWindow = (typeof PROGRESS_WINDOWS)[number];
type TdeeWindow = (typeof TDEE_WINDOWS)[number];

/** Fit-Log-D1 の接続設定が揃っているか確認する。 */
export function fitlogConfigured(env: Env): boolean {
  return Boolean(env.FITLOG_API_URL && (env.FITLOG_API_KEY || (env.FITLOG_CLIENT_ID && env.FITLOG_CLIENT_SECRET)));
}

export class FitlogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FitlogError';
  }
}

/** 健康データが必要な相談かを保守的に判定する。 */
export function refersToFitness(message: string): boolean {
  return /(筋トレ|トレーニング|ワークアウト|ジム|運動|有酸素|屋外|アウトドア|散歩|ウォーキング|歩いた|歩行|歩数|ランニング|ジョギング|走った|サイクリング|自転車|ハイキング|登山|体重|体脂肪|脂肪量|除脂肪|腹囲|ウエスト|カロリー|PFC|タンパク質|たんぱく質|脂質|炭水化物|食事|塩分|揚げ物|食物繊維|プロテイン|飲酒|お酒|酒量|ビール|睡眠|眠り|寝た|コンディション|増量|減量|体調|健康|フィットネス|TDEE|1RM|自己ベスト|筋力|ボリューム|FitLog|FIT LOG)/i.test(
    message,
  );
}

/** 帰宅支援（飲み会モード）の相談かを保守的に判定する。飲酒そのものは refersToFitness 側が拾う。 */
export function refersToNightOut(message: string): boolean {
  return /(飲み会|飲み会モード|帰宅支援|危険ライン|乗り過ごし|乗過ごし|終電|始発待ち|タクシー代|ネットカフェ|ネカフェ|飲みすぎ|飲み過ぎ|家に帰れ|帰れなかった|記憶が(ない|なかった|あいまい)|二日酔い)/.test(
    message,
  );
}

export const FITLOG_DAY_TOOL: ToolDeclaration = {
  name: 'fitlog_day',
  description:
    'FIT LOGから、今日または指定日のコンディションを調べます。睡眠、飲酒、腹囲、食事の質、' +
    '体重・体脂肪率、食事とPFC、ジム、有酸素、屋外運動をまとめて返します。' +
    '測定日とデータの出所も返すので、直近値を当日の値と取り違えません。読み取り専用です。',
  parameters: {
    type: 'object',
    properties: { date: { type: 'string', description: '日付（YYYY-MM-DD）。省略すると今日。' } },
  },
};

export const FITLOG_PROGRESS_TOOL: ToolDeclaration = {
  name: 'fitlog_progress',
  description:
    'FIT LOGから、体重・脂肪量・除脂肪量の変化、実測TDEE、週ごとの運動量、筋力の伸び、体脂肪目標への進捗を調べます。' +
    '「最近どう？」「体重は順調？」「筋力は伸びた？」「目標まであとどれくらい？」という相談で使います。読み取り専用です。',
  parameters: {
    type: 'object',
    properties: {
      end_date: { type: 'string', description: '集計の最終日（YYYY-MM-DD）。省略すると今日。' },
      window_days: {
        type: 'number',
        description: '体組成・運動量・筋力を見る期間。14、28、42日のいずれか。既定28日。',
      },
      tdee_window_days: {
        type: 'number',
        description: '実測TDEEを見る期間。30、90、180日のいずれか。既定90日。',
      },
    },
  },
};

export const FITLOG_WEEKLY_TOOL: ToolDeclaration = {
  name: 'fitlog_weekly',
  description:
    'FIT LOGから、直前に完了した月曜〜日曜の1週間について、ジム、筋トレ量、有酸素、屋外運動、食事記録、体重、自己ベストをまとめて調べます。' +
    'FIT LOG側のAIコメント生成や既読更新は行わない読み取り専用の取得です。',
  parameters: {
    type: 'object',
    properties: {
      reference_date: {
        type: 'string',
        description: 'この日を基準に、その直前の完了週を取得します（YYYY-MM-DD）。省略すると今日。',
      },
    },
  },
};

export const FITLOG_EXERCISE_TOOL: ToolDeclaration = {
  name: 'fitlog_exercise',
  description:
    'FIT LOGから、指定した筋トレ種目・マシンの前回記録、自己ベスト、推定1RM推移、直近28日のボリュームを調べます。' +
    '種目名が分かる相談で使います。読み取り専用です。',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'FIT LOGに登録されている種目名・マシン名。' } },
    required: ['name'],
  },
};

export const FITLOG_NIGHTS_TOOL: ToolDeclaration = {
  name: 'fitlog_nights',
  description:
    'FIT LOGの帰宅支援（飲み会モード）から、夜ごとの記録を調べます。飲んだ量、乗り過ごし・家に着けたかの結果、' +
    '帰り方（方法・最遠到達駅・実際に降りた駅）、翌朝答えた費用・敗因をまとめて返します。' +
    'scopeを省略または"recent"にすると直近の記録（既定30件、最大30件）、"all"にすると全期間の記録です。読み取り専用です。',
  parameters: {
    type: 'object',
    properties: {
      scope: { type: 'string', description: '"recent"（直近、既定）または"all"（全期間）。' },
      limit: { type: 'number', description: 'scopeが"recent"のときの件数上限。既定30、最大30。' },
    },
  },
};

export const FITLOG_NIGHT_DANGER_TOOL: ToolDeclaration = {
  name: 'fitlog_night_danger',
  description:
    'FIT LOGの帰宅支援から、自分の「危険ライン」（これを超えると乗り過ごし・記憶が曖昧などの悪い結果になりやすい純アルコール量とペース）、' +
    '昨夜の睡眠、今年の帰宅費用、敗因タグの傾向を調べます。悪い夜が3晩たまるまでは仮の値です。読み取り専用です。',
  parameters: { type: 'object', properties: {} },
};

export const FITLOG_TOOLS = [
  FITLOG_DAY_TOOL,
  FITLOG_PROGRESS_TOOL,
  FITLOG_WEEKLY_TOOL,
  FITLOG_EXERCISE_TOOL,
  FITLOG_NIGHTS_TOOL,
  FITLOG_NIGHT_DANGER_TOOL,
];

const OUTDOOR_LABELS: Record<string, string> = {
  walking: 'ウォーキング',
  running: 'ランニング',
  cycling: 'サイクリング',
  other: 'その他',
};

export interface FitlogTodayRaw {
  status: string;
  /** eatenは食事のみ。alcohol（お酒由来）とtotal（合算）は画面と同じ値で、古いサーバーでは無い。 */
  kcal?: { eaten: number; target: number; alcohol?: number; total?: number };
  kcalBonus?: { gym: number; outdoor: number; total: number };
  protein?: { g: number; target: number };
  fat?: { g: number; target: number };
  carb?: { g: number; target: number; alcohol?: number; total?: number };
  alcoholTotals?: { pureAlcoholG: number; kcal: number; carbG: number; purineMg: number };
  meals?: {
    id: string;
    time: string;
    label: string;
    name: string;
    kcal: number;
    protein: number;
    fat: number;
    carb: number;
    tags?: {
      salt?: 'low' | 'mid' | 'high';
      fried?: boolean;
      fiber?: 'low' | 'mid' | 'high';
      alcohol?: boolean;
    } | null;
  }[];
  weightKg?: number | null;
  bodyfatPercent?: number | null;
  targetBodyfat?: number | null;
  weightDeltaKg?: number | null;
  weightTrend7d?: number[];
  hasBodyMetrics?: boolean;
  bodyMetricsMeta?: {
    requestedDate: string;
    hasEntryOnDate: boolean;
    weightRecordedDate: string | null;
    bodyfatRecordedDate: string | null;
    weightSource: string | null;
    bodyfatSource: string | null;
    healthLastSync: string | null;
  };
  healthSuggestion?: { weight: number | null; bodyfat: number | null } | null;
  exercise?: { strengthSets: number; cardioMinutes: number };
  workoutEntries?: {
    id: string;
    name: string;
    type: 'strength' | 'cardio';
    sets: { weight: number | null; reps: number | null }[];
    time: number | null;
    dist: number | null;
    level: number | null;
    floors: number | null;
    cardioKcal: number | null;
  }[];
  outdoor?: {
    id: string;
    time: string | null;
    activityType: string | null;
    distance: number | null;
    duration: number | null;
    avgHeartRate?: number | null;
    kcal: number | null;
    elevationGain?: number | null;
    source?: string | null;
  }[];
  alcohol?: {
    id: string;
    time: string | null;
    drinkKey: string;
    label: string;
    volumeMl: number;
    abvPercent: number;
    pureAlcoholG: number;
  }[];
  waistCm?: number | null;
  steps?: number | null;
  sleep?: { totalMin: number; deepMin: number; remMin: number } | null;
  sleepTrend14?: { date: string; deepMin: number; remMin: number; coreMin: number }[];
}

type ChangeMetric = { start: number | null; current: number | null; delta: number | null };

interface FitlogAnalysisRaw {
  status: string;
  tdee?: {
    targetKcal: number | null;
    windows: {
      windowDays: number;
      tdee: number | null;
      avgIntake: number | null;
      pacePerWeek: number | null;
      deficit: number | null;
      mealDays: number;
      weightDays: number;
      reliable: boolean;
      reason: 'ok' | 'insufficient_weight' | 'insufficient_meals';
    }[];
  };
  weeklyOutput?: Record<
    string,
    {
      weekStart: string;
      gymDays: number;
      cardioMin: number;
      cardioKcal: number;
      strengthSets: number;
      volume: number;
      outdoorCount: number;
      outdoorDistance: number;
      outdoorKcal: number;
    }[]
  >;
  composition?: Record<
    string,
    { summary: { windowDays: number; weight: ChangeMetric; fat: ChangeMetric; lean: ChangeMetric } }
  >;
  strength?: Record<
    string,
    {
      name: string;
      recordCount: number;
      recentAvg: number | null;
      prevAvg: number | null;
      growth: number | null;
      dataSufficient: boolean;
    }[]
  >;
}

interface FitlogRewardProgressRaw {
  status: string;
  bodyfat15?: {
    target: number;
    avg: number | null;
    samples: number;
    minSamples: number;
    firstBodyfat: number | null;
    firstDate: string | null;
    unlockedAt: string | null;
  };
}

interface FitlogWeeklyRaw {
  status: string;
  weekStart: string;
  weekEnd: string;
  hasActivity: boolean;
  badges?: { key: string; title: string; text: string }[];
  facts?: {
    gymDays: number;
    prevGymDays: number;
    strengthSets: number;
    volume: number;
    prevVolume: number;
    cardioMinutes: number;
    prs: { name: string; weight: number; reps: number; date: string }[];
    outdoorCount: number;
    outdoorDistance: number;
    outdoorKcal: number;
    outdoorMinutes: number;
    mealDays: number;
    proteinHitDays: number;
    avgKcal: number | null;
    avgKcalWithAlcohol?: number | null;
    alcohol?: { days: number; pureAlcoholG: number; kcal: number; carbG: number; purineMg: number };
    targetKcal: number | null;
    /** 食事記録のある日の「基本目標＋運動日の追加分」の平均。古いサーバーでは無い。 */
    avgTargetKcal?: number | null;
    avgBonusKcal?: number | null;
    weightStart: number | null;
    weightEnd: number | null;
    weightDays: number;
  };
}

interface FitlogExerciseRaw {
  status: string;
  machine?: { name: string; area: string | null; part: string | null; type: string | null; techniqueMemo: string | null };
  best?: { weight: number; reps: number; date: string } | null;
  latest?: {
    date: string;
    best: { weight: number; reps: number } | null;
    sets: { weight: number; reps: number }[];
  } | null;
  volume28d?: number;
  totalVolume?: number;
  recordCount?: number;
  trend?: { date: string; e1rm: number }[];
  records?: {
    date: string;
    memo: string | null;
    sets: { weight: number; reps: number }[];
    volume: number;
    time: number | null;
    dist: number | null;
    level: number | null;
    floors: number | null;
    cardioKcal: number | null;
  }[];
}

interface FitlogNightRaw {
  night_date: string;
  outcome: string;
  memory: string | null;
  hangover: string | null;
  extra_drinks: number | null;
  drinks_count: number;
  pure_alcohol_g: number;
  kcal: number | null;
  max_pace_g_per_h: number | null;
  water_count: number;
  return_method: string | null;
  return_cost_yen: number | null;
  failure_cause: string | null;
  failure_tags: string[];
  farthest_station: string | null;
  prompts_total: number | null;
  prompts_answered: number | null;
  max_alert_level: number | null;
  answered_at: number | null;
  dismissed_at: number | null;
  report?: { train?: { alightedBy?: string | null } | null } | null;
}

interface FitlogNightsListRaw {
  status: string;
  nights?: FitlogNightRaw[];
}

interface FitlogDangerStatsRaw {
  lineG: number;
  lineLearned: boolean;
  paceLine: number;
  paceLearned: boolean;
  nights: number;
  badNights: number;
  above: { nights: number; bad: number };
  below: { nights: number; bad: number };
  waterNights: { nights: number; bad: number };
  costYenThisYear: number;
  tags: { tag: string; count: number }[];
  sleepLastNightMin: number | null;
  sleepShort: boolean;
  todayLineG: number;
}

interface FitlogNightsExportRaw {
  status: string;
  nights?: FitlogNightRaw[];
  stats?: FitlogDangerStatsRaw;
}

interface FitlogNightStatsRaw {
  status: string;
  stats?: FitlogDangerStatsRaw;
}

export function cleanCredential(raw: string): string {
  const trimmed = raw.trim();
  const stripped = trimmed.replace(/^[\w-]+:\s*/i, '').trim();
  return stripped.replace(/^Bearer\s+/i, '').trim();
}

export function refusalHint(status: number): string {
  if (status === 401) return 'Fit-LogのAPIキーが無効か期限切れです。FITLOG_API_KEYを確認してください。';
  if (status === 403) return 'Cloudflare Accessで弾かれました。FITLOG_CLIENT_IDとFITLOG_CLIENT_SECRETを確認してください。';
  if (status === 404) return 'Fit-Logのエンドポイントまたは記録が見つかりません。';
  return `Fit-Logがエラー（HTTP ${status}）を返しました。`;
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) return false;
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === trimmed;
}

function validDate(value: unknown, fallback: string): string {
  return isValidIsoDate(value) ? value.trim() : fallback;
}

export function readFitlogDayArgs(raw: unknown, defaultDate: string): { date: string | null; error?: string } {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (obj.date == null || obj.date === '') return { date: defaultDate };
  if (isValidIsoDate(obj.date)) return { date: obj.date.trim() };
  return { date: null, error: '日付は実在する日をYYYY-MM-DD形式で指定してください。' };
}

export function readFitlogProgressArgs(
  raw: unknown,
  defaultDate: string,
): { endDate: string; windowDays: ProgressWindow; tdeeWindowDays: TdeeWindow } {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const window = Number(obj.window_days);
  const tdeeWindow = Number(obj.tdee_window_days);
  return {
    endDate: validDate(obj.end_date, defaultDate),
    windowDays: (PROGRESS_WINDOWS as readonly number[]).includes(window) ? (window as ProgressWindow) : 28,
    tdeeWindowDays: (TDEE_WINDOWS as readonly number[]).includes(tdeeWindow) ? (tdeeWindow as TdeeWindow) : 90,
  };
}

export function readFitlogWeeklyArgs(raw: unknown, defaultDate: string): { referenceDate: string } {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { referenceDate: validDate(obj.reference_date, defaultDate) };
}

export function readFitlogExerciseArgs(raw: unknown): { name: string } {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { name: typeof obj.name === 'string' ? obj.name.trim().slice(0, 100) : '' };
}

export function readFitlogNightsArgs(raw: unknown): { scope: 'recent' | 'all'; limit: number } {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const scope = obj.scope === 'all' ? 'all' : 'recent';
  const limitNum = Number(obj.limit);
  const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(30, Math.round(limitNum)) : 30;
  return { scope, limit };
}

async function fetchFitlogJson<T>(env: Env, path: string, params: Record<string, string>): Promise<T> {
  if (!fitlogConfigured(env)) throw new FitlogError('FIT LOGの接続が設定されていません。');
  const baseUrl = env.FITLOG_API_URL!.replace(/\/+$/, '');
  const url = `${baseUrl}${path}?${new URLSearchParams(params).toString()}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (env.FITLOG_API_KEY) headers.Authorization = `Bearer ${cleanCredential(env.FITLOG_API_KEY)}`;
  if (env.FITLOG_CLIENT_ID && env.FITLOG_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = cleanCredential(env.FITLOG_CLIENT_ID);
    headers['CF-Access-Client-Secret'] = cleanCredential(env.FITLOG_CLIENT_SECRET);
  }
  const response = await fetch(url, { method: 'GET', headers, redirect: 'manual' });
  if (!response.ok) throw new FitlogError(refusalHint(response.status));
  return (await response.json()) as T;
}

function sourceLabel(source: string | null | undefined): string {
  if (source === 'health') return 'Appleヘルスケア';
  if (source === 'screenshot') return '手入力（スクリーンショット）';
  if (source) return source;
  return '手入力または移行データ';
}

function measuredValue(value: number | null | undefined, unit: string, recordedDate: string | null | undefined, requestedDate: string): string {
  if (value == null) return '未記録';
  const dateNote = recordedDate && recordedDate !== requestedDate ? `（${recordedDate}の直近記録）` : '';
  return `${value}${unit}${dateNote}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatMinutes(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return hours > 0 ? `${hours}時間${minutes}分（${rounded}分）` : `${minutes}分`;
}

function sleepCondition(raw: FitlogTodayRaw, date: string): Record<string, unknown> {
  if (!raw.sleep) {
    return {
      記録: 'なし',
      注記: '睡眠時間0分ではなく、対象日の睡眠記録がありません。',
    };
  }

  const previous = (raw.sleepTrend14 ?? [])
    .filter((night) => night.date < date)
    .map((night) => ({
      totalMin: night.deepMin + night.remMin + night.coreMin,
      deepMin: night.deepMin,
      remMin: night.remMin,
    }));
  const average = (key: 'totalMin' | 'deepMin' | 'remMin'): number | null =>
    previous.length ? previous.reduce((sum, night) => sum + night[key], 0) / previous.length : null;
  const avgTotal = average('totalMin');
  const avgDeep = average('deepMin');
  const avgRem = average('remMin');

  return {
    記録: 'あり',
    合計: formatMinutes(raw.sleep.totalMin),
    深い睡眠: formatMinutes(raw.sleep.deepMin),
    REM睡眠: formatMinutes(raw.sleep.remMin),
    直前の睡眠平均:
      avgTotal == null
        ? '比較できる過去記録なし'
        : {
            比較した夜数: previous.length,
            合計: formatMinutes(avgTotal),
            深い睡眠: formatMinutes(avgDeep ?? 0),
            REM睡眠: formatMinutes(avgRem ?? 0),
          },
    平均との差: avgTotal == null ? '比較不可' : `${Math.round(raw.sleep.totalMin - avgTotal) >= 0 ? '+' : ''}${Math.round(raw.sleep.totalMin - avgTotal)}分`,
  };
}

function alcoholCondition(raw: FitlogTodayRaw): Record<string, unknown> {
  const logs = raw.alcohol ?? [];
  if (!logs.length) {
    return {
      記録: 'なし',
      注記: '飲まなかったという意味ではなく、飲酒記録がありません。',
    };
  }
  return {
    記録: 'あり',
    件数: logs.length,
    純アルコール合計: `${round1(logs.reduce((sum, log) => sum + log.pureAlcoholG, 0))}g`,
    お酒のkcal: raw.alcoholTotals ? `${raw.alcoholTotals.kcal}kcal（摂取kcalに含む）` : '不明',
    お酒の糖質: raw.alcoholTotals ? `${raw.alcoholTotals.carbG}g（炭水化物に含む）` : '不明',
    内訳: logs.map(
      (log) => `${log.time ? `${log.time} ` : ''}${log.label} ${log.volumeMl}ml（${log.abvPercent}%・純アルコール${round1(log.pureAlcoholG)}g）`,
    ),
  };
}

const SALT_LABELS = { low: '塩分控えめ', mid: '塩分普通', high: '塩分高め' } as const;
const FIBER_LABELS = { low: '食物繊維少なめ', mid: '食物繊維普通', high: '食物繊維多め' } as const;

function mealQualityCondition(raw: FitlogTodayRaw): Record<string, unknown> {
  const meals = raw.meals ?? [];
  const tagged = meals.filter((meal) => meal.tags != null);
  const mealTags = tagged.map((meal) => {
    const tags = meal.tags!;
    const labels = [
      tags.salt ? SALT_LABELS[tags.salt] : null,
      tags.fried ? '揚げ物・脂多め' : null,
      tags.fiber ? FIBER_LABELS[tags.fiber] : null,
      tags.alcohol ? '食事内に飲酒あり' : null,
    ].filter(Boolean);
    return `${meal.time ? `${meal.time} ` : ''}[${meal.label}] ${meal.name || '食事'}: ${labels.join('・') || '該当タグなし'}`;
  });

  return {
    食事記録数: meals.length,
    タグ判定済み: `${tagged.length}/${meals.length}食`,
    高塩分: tagged.filter((meal) => meal.tags?.salt === 'high').length,
    揚げ物または脂多め: tagged.filter((meal) => meal.tags?.fried === true).length,
    食物繊維少なめ: tagged.filter((meal) => meal.tags?.fiber === 'low').length,
    食事内の飲酒タグ: tagged.filter((meal) => meal.tags?.alcohol === true).length,
    食事別: mealTags.length ? mealTags : 'タグ判定済みの食事なし',
    注記: '食事内の飲酒タグは文脈用です。純アルコール合計には加算していません。未判定の食事を「問題なし」とは扱いません。',
  };
}

/** 日次レスポンスを、出所と欠測を失わずにモデル向けへ圧縮する。 */
export function summarizeFitlogDay(raw: FitlogTodayRaw, date: string): Record<string, unknown> {
  // 画面と同じく、お酒のkcal・糖質を合算した値を「摂取」として扱う（実測TDEEの摂取量も同じ合算）。
  const mealKcal = raw.kcal?.eaten ?? 0;
  const alcoholKcal = raw.kcal?.alcohol ?? 0;
  const eatenKcal = raw.kcal?.total ?? mealKcal + alcoholKcal;
  const mealCarbG = raw.carb?.g ?? 0;
  const alcoholCarbG = raw.carb?.alcohol ?? 0;
  const totalCarbG = raw.carb?.total ?? mealCarbG + alcoholCarbG;
  const targetKcal = raw.kcal?.target ?? 0;
  const remainingKcal = targetKcal - eatenKcal;
  const meta = raw.bodyMetricsMeta;
  const weightRecordedDate = meta?.weightRecordedDate ?? (raw.hasBodyMetrics ? date : null);
  const bodyfatRecordedDate = meta?.bodyfatRecordedDate ?? (raw.hasBodyMetrics ? date : null);
  const targetBodyfat = raw.targetBodyfat ?? null;
  const bodyfatGap = raw.bodyfatPercent != null && targetBodyfat != null ? Math.round((raw.bodyfatPercent - targetBodyfat) * 10) / 10 : null;

  const workouts = (raw.workoutEntries ?? []).map((entry) => {
    if (entry.type === 'strength') {
      const sets = entry.sets
        .map((s) => `${s.weight != null ? `${s.weight}kg` : '?kg'}×${s.reps != null ? `${s.reps}回` : '?回'}`)
        .join(', ');
      return `${entry.name}（${entry.sets.length}セット: ${sets || '詳細なし'}）`;
    }
    const details = [
      entry.time != null ? `${entry.time}分` : null,
      entry.dist != null ? `${entry.dist}km` : null,
      entry.cardioKcal != null ? `${entry.cardioKcal}kcal` : null,
    ].filter(Boolean);
    return `${entry.name}（${details.join('、') || '記録あり'}）`;
  });

  const outdoor = (raw.outdoor ?? []).map((entry) => {
    const details = [
      entry.duration != null ? `${entry.duration}分` : null,
      entry.distance != null ? `${entry.distance}km` : null,
      entry.kcal != null ? `${entry.kcal}kcal` : null,
      entry.avgHeartRate != null ? `平均心拍${entry.avgHeartRate}` : null,
      entry.elevationGain != null ? `獲得標高${entry.elevationGain}m` : null,
    ].filter(Boolean);
    const activity = entry.activityType ? (OUTDOOR_LABELS[entry.activityType] ?? entry.activityType) : '屋外運動';
    return `${activity}${entry.time ? ` ${entry.time}` : ''}（${details.join('、') || '記録あり'}／${sourceLabel(entry.source)}）`;
  });

  const meals = (raw.meals ?? []).map(
    (m) => `${m.time ? `${m.time} ` : ''}[${m.label}] ${m.name || '食事'}（${m.kcal}kcal / P:${m.protein}g F:${m.fat}g C:${m.carb}g）`,
  );

  return {
    対象日: date,
    記録の状態: {
      対象日の体組成記録: meta?.hasEntryOnDate ?? raw.hasBodyMetrics ?? false,
      体重の測定日: weightRecordedDate ?? '不明',
      体脂肪率の測定日: bodyfatRecordedDate ?? '不明',
      体重の出所: raw.weightKg == null ? '記録なし' : sourceLabel(meta?.weightSource),
      体脂肪率の出所: raw.bodyfatPercent == null ? '記録なし' : sourceLabel(meta?.bodyfatSource),
      ヘルスケア最終同期: meta?.healthLastSync ?? '不明',
      手入力との食い違い候補: raw.healthSuggestion ?? 'なし',
    },
    体組成: {
      体重: measuredValue(raw.weightKg, 'kg', weightRecordedDate, date),
      前回測定比: raw.weightDeltaKg != null ? `${raw.weightDeltaKg >= 0 ? '+' : ''}${raw.weightDeltaKg}kg` : '比較なし',
      体脂肪率: measuredValue(raw.bodyfatPercent, '%', bodyfatRecordedDate, date),
      目標体脂肪率: targetBodyfat != null ? `${targetBodyfat}%` : '未設定',
      目標との差: bodyfatGap == null ? '算出不可' : bodyfatGap <= 0 ? '目標圏内' : `あと${bodyfatGap}ポイント`,
      直近7記録の体重: raw.weightTrend7d?.length ? raw.weightTrend7d.map((w) => `${w}kg`) : '記録なし',
    },
    運動: {
      筋トレセット数: raw.exercise?.strengthSets ?? 0,
      ジム有酸素: `${raw.exercise?.cardioMinutes ?? 0}分`,
      ジムの内訳: workouts.length ? workouts : '記録なし',
      屋外運動: outdoor.length ? outdoor : '記録なし',
    },
    食事と栄養: {
      カロリー: {
        摂取: `${eatenKcal}kcal（食事${mealKcal}kcal＋お酒${alcoholKcal}kcal）`,
        目標: `${targetKcal}kcal`,
        運動日の追加分: raw.kcalBonus ?? { gym: 0, outdoor: 0, total: 0 },
        残り: remainingKcal >= 0 ? `${remainingKcal}kcal` : `超過${Math.abs(remainingKcal)}kcal`,
      },
      PFC: {
        たんぱく質: `${raw.protein?.g ?? 0}g / 目標${raw.protein?.target ?? 0}g`,
        脂質: `${raw.fat?.g ?? 0}g / 目標${raw.fat?.target ?? 0}g`,
        炭水化物: `${totalCarbG}g / 目標${raw.carb?.target ?? 0}g（食事${mealCarbG}g＋お酒の糖質${alcoholCarbG}g）`,
      },
      注記: '摂取kcalと炭水化物はお酒の分を含みます（FIT LOGの画面と同じ）。食事一覧は食事のみの内訳です。',
      食事一覧: meals.length ? meals : '記録なし',
    },
    コンディション: {
      睡眠: sleepCondition(raw, date),
      飲酒: alcoholCondition(raw),
      腹囲: raw.waistCm != null ? `${raw.waistCm}cm（対象日ちょうどの記録）` : '未記録（直近値では補完していません）',
      食事の質: mealQualityCondition(raw),
      歩数: raw.steps != null ? `${raw.steps}歩（対象日ちょうどの記録。ヘルスケア由来）` : '未記録',
    },
    注意: 'FIT LOG自身のAIコメントと写真は含めていません。医療的な診断には使いません。',
    出所: 'FIT LOG D1（データベース実測値）',
  };
}

function changeSummary(metric: ChangeMetric | undefined, unit: string): string {
  if (!metric || metric.start == null || metric.current == null || metric.delta == null) return '記録不足';
  return `${metric.start}${unit} → ${metric.current}${unit}（${metric.delta >= 0 ? '+' : ''}${metric.delta}${unit}）`;
}

/** 分析・目標レスポンスから、指定窓だけを抜いてモデル向けへ圧縮する。 */
export function summarizeFitlogProgress(
  analysis: FitlogAnalysisRaw,
  reward: FitlogRewardProgressRaw,
  endDate: string,
  windowDays: ProgressWindow,
  tdeeWindowDays: TdeeWindow,
): Record<string, unknown> {
  const composition = analysis.composition?.[String(windowDays)]?.summary;
  const tdee = analysis.tdee?.windows.find((row) => row.windowDays === tdeeWindowDays);
  const weeks = analysis.weeklyOutput?.[String(windowDays)] ?? [];
  const strength = (analysis.strength?.[String(windowDays)] ?? []).slice(0, 10).map((row) => ({
    種目: row.name,
    記録回数: row.recordCount,
    直近の推定1RM平均: row.recentAvg != null ? `${Math.round(row.recentAvg * 10) / 10}kg` : '記録なし',
    前期間比: row.dataSufficient && row.growth != null ? `${row.growth >= 0 ? '+' : ''}${Math.round(row.growth * 1000) / 10}%` : '比較データ不足',
  }));
  const goal = reward.bodyfat15;
  const remaining = goal?.avg != null ? Math.round((goal.avg - goal.target) * 10) / 10 : null;

  return {
    集計最終日: endDate,
    体組成の期間: `${windowDays}日`,
    体組成: {
      体重: changeSummary(composition?.weight, 'kg'),
      脂肪量: changeSummary(composition?.fat, 'kg'),
      除脂肪量: changeSummary(composition?.lean, 'kg'),
    },
    実測TDEE: tdee
      ? {
          期間: `${tdee.windowDays}日`,
          信頼できる計算か: tdee.reliable,
          信頼できない理由:
            tdee.reason === 'insufficient_weight' ? '体重記録不足' : tdee.reason === 'insufficient_meals' ? '食事記録不足' : 'なし',
          TDEE: tdee.tdee != null ? `${tdee.tdee}kcal/日` : '算出不可',
          平均摂取: tdee.avgIntake != null ? `${tdee.avgIntake}kcal/日` : '算出不可',
          体重ペース: tdee.pacePerWeek != null ? `${tdee.pacePerWeek >= 0 ? '+' : ''}${tdee.pacePerWeek}kg/週` : '算出不可',
          食事記録日数: `${tdee.mealDays}/${tdee.windowDays}日`,
          体重記録日数: `${tdee.weightDays}日`,
          設定中の摂取目標: analysis.tdee?.targetKcal != null ? `${analysis.tdee.targetKcal}kcal` : '未設定',
        }
      : '対象期間の計算なし',
    週ごとの運動量: weeks.map((week) => ({
      週開始: week.weekStart,
      ジム日数: week.gymDays,
      筋トレセット: week.strengthSets,
      筋トレ総ボリューム: `${week.volume}kg`,
      ジム有酸素: `${week.cardioMin}分 / ${week.cardioKcal}kcal`,
      屋外運動: `${week.outdoorCount}回 / ${week.outdoorDistance}km / ${week.outdoorKcal}kcal`,
    })),
    筋力の変化: strength.length ? strength : '記録なし',
    体脂肪率目標: goal
      ? {
          目標: `${goal.target}%`,
          直近7日の平均: goal.avg != null ? `${goal.avg}%` : '記録なし',
          測定日数: `${goal.samples}日（判定に必要${goal.minSamples}日）`,
          現在地: remaining == null ? '算出不可' : remaining <= 0 ? '達成圏内' : `あと${remaining}ポイント`,
          達成日: goal.unlockedAt ?? '未達成',
        }
      : 'データなし',
    注意: 'TDEEや体組成は記録日数と信頼性を一緒に読み、医療的な診断には使いません。',
    出所: 'FIT LOG D1（分析用の集計値）',
  };
}

/** 週次レスポンスから、FIT LOG側のAI文を除いて事実だけを返す。 */
export function summarizeFitlogWeekly(raw: FitlogWeeklyRaw): Record<string, unknown> {
  const f = raw.facts;
  if (!f) return { 対象週: `${raw.weekStart}〜${raw.weekEnd}`, 記録: 'なし', 出所: 'FIT LOG D1' };
  const weightDelta = f.weightStart != null && f.weightEnd != null ? Math.round((f.weightEnd - f.weightStart) * 10) / 10 : null;
  return {
    対象週: `${raw.weekStart}〜${raw.weekEnd}`,
    記録あり: raw.hasActivity,
    運動: {
      ジム: `${f.gymDays}日（前週${f.prevGymDays}日）`,
      筋トレ: `${f.strengthSets}セット / 総ボリューム${f.volume}kg（前週${f.prevVolume}kg）`,
      ジム有酸素: `${f.cardioMinutes}分`,
      屋外運動: `${f.outdoorCount}回 / ${f.outdoorMinutes}分 / ${f.outdoorDistance}km / ${f.outdoorKcal}kcal`,
      自己ベスト: f.prs.length ? f.prs.map((pr) => `${pr.date} ${pr.name} ${pr.weight}kg×${pr.reps}回`) : 'なし',
    },
    食事: {
      記録日数: `${f.mealDays}/7日`,
      たんぱく質目標9割以上: `${f.proteinHitDays}日`,
      // お酒込みが画面・実測TDEEと同じ定義。古いサーバーでは食事のみにフォールバックする。
      平均摂取: (() => {
        const withAlcohol = f.avgKcalWithAlcohol ?? f.avgKcal;
        if (withAlcohol == null) return '記録なし';
        return f.avgKcal != null && f.avgKcalWithAlcohol != null
          ? `${withAlcohol}kcal/日（お酒込み。食事のみでは${f.avgKcal}kcal/日）`
          : `${withAlcohol}kcal/日`;
      })(),
      飲酒: f.alcohol
        ? { 飲酒日数: `${f.alcohol.days}日`, 純アルコール合計: `${f.alcohol.pureAlcoholG}g`, お酒のkcal合計: `${f.alcohol.kcal}kcal` }
        : '不明',
      基本目標: f.targetKcal != null ? `${f.targetKcal}kcal/日` : '未設定',
      // 日次の「目標」と同じ式（基本目標＋ジム日の固定額＋屋外運動の実測kcal）を、食事記録のある日で平均したもの。
      運動日の追加分込みの目標:
        f.avgTargetKcal != null
          ? `${f.avgTargetKcal}kcal/日（運動日の追加分は平均${f.avgBonusKcal ?? 0}kcal/日）`
          : '不明（基本目標だけで比べない）',
    },
    体重: {
      測定日数: `${f.weightDays}日`,
      週初め: f.weightStart != null ? `${f.weightStart}kg` : '記録なし',
      週終わり: f.weightEnd != null ? `${f.weightEnd}kg` : '記録なし',
      変化: weightDelta == null ? '比較不可' : `${weightDelta >= 0 ? '+' : ''}${weightDelta}kg`,
    },
    達成バッジ: raw.badges?.length ? raw.badges.map((badge) => `${badge.title} ${badge.text}`) : 'なし',
    注意: 'FIT LOG側のAIコメントは取得・生成していません。',
    出所: 'FIT LOG D1（週次の事実集計）',
  };
}

/** 種目別レスポンスを直近の判断に必要な範囲へ圧縮する。 */
export function summarizeFitlogExercise(raw: FitlogExerciseRaw, askedName: string): Record<string, unknown> {
  if (!raw.machine) return { 種目: askedName, error: '種目が見つかりませんでした。' };
  const isCardio = raw.machine.type === 'cardio';
  const recent = (raw.records ?? []).slice(0, 8).map((record) =>
    isCardio
      ? `${record.date}: ${record.time ?? '?'}分 / ${record.dist ?? '?'}km / ${record.cardioKcal ?? '?'}kcal`
      : `${record.date}: ${record.sets.map((set) => `${set.weight}kg×${set.reps}回`).join(', ')}（ボリューム${record.volume}kg）`,
  );
  return {
    種目: raw.machine.name,
    部位: [raw.machine.area, raw.machine.part].filter(Boolean).join(' / ') || '未設定',
    使い方メモ: raw.machine.techniqueMemo ?? 'なし',
    記録回数: raw.recordCount ?? 0,
    前回: raw.latest
      ? {
          日付: raw.latest.date,
          セット: raw.latest.sets.map((set) => `${set.weight}kg×${set.reps}回`),
          その日の最高: raw.latest.best ? `${raw.latest.best.weight}kg×${raw.latest.best.reps}回` : 'なし',
        }
      : '記録なし',
    自己ベスト: raw.best ? `${raw.best.weight}kg×${raw.best.reps}回（${raw.best.date}）` : 'なし',
    直近28日ボリューム: `${raw.volume28d ?? 0}kg`,
    推定1RM推移: (raw.trend ?? []).slice(-12).map((point) => `${point.date}: ${point.e1rm}kg`),
    最近の記録: recent.length ? recent : '記録なし',
    出所: 'FIT LOG D1（種目別記録）',
  };
}

const NIGHT_OUTCOME_LABELS: Record<string, string> = {
  normal: '普通に帰宅',
  overshoot: '乗り過ごした',
  not_home: '家に着かなかった',
};
const NIGHT_MEMORY_LABELS: Record<string, string> = { full: 'しっかりある', hazy: 'あいまい', none: 'ない' };
const NIGHT_HANGOVER_LABELS: Record<string, string> = { none: 'なし', light: '軽い', heavy: '重い' };
const NIGHT_RETURN_LABELS: Record<string, string> = {
  train_back: '電車で戻った',
  taxi: 'タクシー',
  carshare: 'カーシェア',
  walk: '歩いた',
  netcafe: 'ネットカフェ',
  first_train: '始発待ち',
  other: 'その他',
};

/** 夜1件を、量・結果・帰り方・費用・敗因に絞って圧縮する。店の周辺地名（venue_label）は渡さない。 */
export function summarizeFitlogNight(n: FitlogNightRaw): Record<string, unknown> {
  return {
    日付: n.night_date,
    回答状況: n.dismissed_at != null ? '対象外（飲んでいない夜として除外）' : n.answered_at != null ? '翌朝のふりかえり回答済み' : '未回答（翌朝のふりかえり待ち）',
    量: {
      飲酒回数: n.drinks_count,
      純アルコール合計: `${n.pure_alcohol_g}g`,
      最大ペース: n.max_pace_g_per_h != null ? `${n.max_pace_g_per_h}g/時` : '算出不可（飲酒記録なし）',
      記録漏れ: n.extra_drinks != null ? `${n.extra_drinks}杯` : '未回答',
      水: `${n.water_count}杯`,
      kcal: n.kcal ?? '記録なし',
    },
    結果: {
      種別: NIGHT_OUTCOME_LABELS[n.outcome] ?? n.outcome,
      記憶: n.memory ? (NIGHT_MEMORY_LABELS[n.memory] ?? n.memory) : '未回答',
      二日酔い: n.hangover ? (NIGHT_HANGOVER_LABELS[n.hangover] ?? n.hangover) : '未回答',
      通知への応答: n.prompts_total != null ? `${n.prompts_answered ?? 0}/${n.prompts_total}件` : '記録なし',
      最大警戒レベル: n.max_alert_level ?? '記録なし',
    },
    帰り方: {
      方法: n.return_method ? (NIGHT_RETURN_LABELS[n.return_method] ?? n.return_method) : '未回答',
      最遠到達駅: n.farthest_station ?? '記録なし',
      実際に降りた駅: n.report?.train?.alightedBy ?? '記録なし',
    },
    費用: n.return_cost_yen != null ? `${n.return_cost_yen}円` : '未回答',
    敗因: {
      内容: n.failure_cause ?? '未回答',
      タグ: n.failure_tags.length ? n.failure_tags : 'なし',
    },
  };
}

/** 夜のリストを、範囲の説明つきで圧縮する。 */
export function summarizeFitlogNights(nights: FitlogNightRaw[], rangeLabel: string): Record<string, unknown> {
  return {
    対象範囲: rangeLabel,
    件数: nights.length,
    夜ごと: nights.length ? nights.map(summarizeFitlogNight) : [],
    注意:
      '店のあたりの地名は含めていません。駅名は本人の同意のもとで含めています（2026-09-30）。' +
      '悪い結果＝乗り過ごし・家に着かなかった・記憶が曖昧またはない、のいずれかです。医療的な診断には使いません。',
    出所: 'FIT LOG D1（帰宅支援の夜ごとの記録）',
  };
}

/** 危険ラインの集計を、根拠つきで圧縮する。 */
export function summarizeFitlogNightDanger(stats: FitlogDangerStatsRaw): Record<string, unknown> {
  return {
    危険ライン: {
      純アルコール: `${stats.lineG}g`,
      学習済みか: stats.lineLearned ? `学習済み（悪い夜${stats.badNights}晩から算出）` : '仮の値（悪い夜が3晩たまるまでの目安。WHOの一時多量飲酒60gを暫定採用）',
      ペース: `${stats.paceLine}g/時`,
      ペース学習済みか: stats.paceLearned ? '学習済み' : '仮の値（暫定40g/時）',
      今日の危険ライン: `${stats.todayLineG}g${stats.sleepShort ? '（前夜の睡眠不足のため8割に下げています）' : ''}`,
    },
    昨夜の睡眠: stats.sleepLastNightMin != null ? formatMinutes(stats.sleepLastNightMin) : '未記録',
    記録件数: { 回答済みの夜: stats.nights, 悪い結果の夜: stats.badNights },
    ラインとの関係: {
      ライン以上だった夜: `${stats.above.nights}晩中、悪い結果${stats.above.bad}晩`,
      ライン未満だった夜: `${stats.below.nights}晩中、悪い結果${stats.below.bad}晩`,
      水を飲んだ夜: `${stats.waterNights.nights}晩中、悪い結果${stats.waterNights.bad}晩`,
    },
    今年の帰宅費用: `${stats.costYenThisYear}円`,
    敗因タグの傾向: stats.tags.length ? stats.tags.map((t) => `${t.tag}: ${t.count}回`) : '記録なし',
    注意: '悪い結果＝乗り過ごし・家に着かなかった・記憶が曖昧またはない、のいずれかです。仮の値は自分の記録からの目安で、医学的な判断ではありません。',
    出所: 'FIT LOG D1（帰宅支援の危険ライン集計）',
  };
}

function toolFailure(error: unknown, context: Record<string, unknown>): Record<string, unknown> {
  return { error: error instanceof FitlogError ? error.message : 'FIT LOGのデータを取得できませんでした。', ...context };
}

export async function runFitlogDayTool(env: Env, call: ToolCall, today: string): Promise<Record<string, unknown>> {
  const { date, error } = readFitlogDayArgs(call.args, today);
  if (!date) return { error: error ?? '日付を読み取れませんでした。' };
  try {
    return summarizeFitlogDay(await fetchFitlogJson<FitlogTodayRaw>(env, '/today', { date }), date);
  } catch (error) {
    return toolFailure(error, { 対象日: date });
  }
}

export async function runFitlogProgressTool(env: Env, call: ToolCall, today: string): Promise<Record<string, unknown>> {
  const args = readFitlogProgressArgs(call.args, today);
  try {
    const [analysis, reward] = await Promise.all([
      fetchFitlogJson<FitlogAnalysisRaw>(env, '/analysis', { date: args.endDate }),
      fetchFitlogJson<FitlogRewardProgressRaw>(env, '/rewards/progress', { date: args.endDate }),
    ]);
    return summarizeFitlogProgress(analysis, reward, args.endDate, args.windowDays, args.tdeeWindowDays);
  } catch (error) {
    return toolFailure(error, { 集計最終日: args.endDate });
  }
}

export async function runFitlogWeeklyTool(env: Env, call: ToolCall, today: string): Promise<Record<string, unknown>> {
  const { referenceDate } = readFitlogWeeklyArgs(call.args, today);
  try {
    const raw = await fetchFitlogJson<FitlogWeeklyRaw>(env, '/recap/weekly', { date: referenceDate, factsOnly: '1' });
    return summarizeFitlogWeekly(raw);
  } catch (error) {
    return toolFailure(error, { 基準日: referenceDate });
  }
}

export async function runFitlogExerciseTool(env: Env, call: ToolCall): Promise<Record<string, unknown>> {
  const { name } = readFitlogExerciseArgs(call.args);
  if (!name) return { error: '調べる種目名がありません。' };
  try {
    return summarizeFitlogExercise(await fetchFitlogJson<FitlogExerciseRaw>(env, '/machines/detail', { name }), name);
  } catch (error) {
    return toolFailure(error, { 種目: name });
  }
}

// /nights/pending は呼ばない。GPS Logからの取り込みが走るアプリ専用の窓なので、読むのはここまで。
export async function runFitlogNightsTool(env: Env, call: ToolCall): Promise<Record<string, unknown>> {
  const { scope, limit } = readFitlogNightsArgs(call.args);
  try {
    if (scope === 'all') {
      const raw = await fetchFitlogJson<FitlogNightsExportRaw>(env, '/nights/export', {});
      return summarizeFitlogNights(raw.nights ?? [], '全期間');
    }
    const raw = await fetchFitlogJson<FitlogNightsListRaw>(env, '/nights', { limit: String(limit) });
    return summarizeFitlogNights(raw.nights ?? [], `直近${limit}件`);
  } catch (error) {
    return toolFailure(error, {});
  }
}

export async function runFitlogNightDangerTool(env: Env): Promise<Record<string, unknown>> {
  try {
    const raw = await fetchFitlogJson<FitlogNightStatsRaw>(env, '/nights/stats', {});
    if (!raw.stats) return { error: '危険ラインを算出できませんでした。' };
    return summarizeFitlogNightDanger(raw.stats);
  } catch (error) {
    return toolFailure(error, {});
  }
}
