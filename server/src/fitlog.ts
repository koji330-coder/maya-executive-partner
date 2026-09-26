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
  return /(筋トレ|トレーニング|ワークアウト|ジム|運動|有酸素|屋外|アウトドア|散歩|ウォーキング|歩いた|歩行|歩数|ランニング|ジョギング|走った|サイクリング|自転車|ハイキング|登山|体重|体脂肪|脂肪量|除脂肪|カロリー|PFC|タンパク質|たんぱく質|脂質|炭水化物|食事|プロテイン|増量|減量|体調|健康|フィットネス|TDEE|1RM|自己ベスト|筋力|ボリューム|FitLog|FIT LOG)/i.test(
    message,
  );
}

export const FITLOG_DAY_TOOL: ToolDeclaration = {
  name: 'fitlog_day',
  description:
    'FIT LOGから、今日または指定日の体重・体脂肪率、食事とPFC、ジム、有酸素、屋外運動を調べます。' +
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

export const FITLOG_TOOLS = [FITLOG_DAY_TOOL, FITLOG_PROGRESS_TOOL, FITLOG_WEEKLY_TOOL, FITLOG_EXERCISE_TOOL];

const OUTDOOR_LABELS: Record<string, string> = {
  walking: 'ウォーキング',
  running: 'ランニング',
  cycling: 'サイクリング',
  other: 'その他',
};

export interface FitlogTodayRaw {
  status: string;
  kcal?: { eaten: number; target: number };
  kcalBonus?: { gym: number; outdoor: number; total: number };
  protein?: { g: number; target: number };
  fat?: { g: number; target: number };
  carb?: { g: number; target: number };
  meals?: {
    id: string;
    time: string;
    label: string;
    name: string;
    kcal: number;
    protein: number;
    fat: number;
    carb: number;
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
    targetKcal: number | null;
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

function validDate(value: unknown, fallback: string): string {
  return typeof value === 'string' && ISO_DATE.test(value.trim()) ? value.trim() : fallback;
}

export function readFitlogDayArgs(raw: unknown, defaultDate: string): { date: string } {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { date: validDate(obj.date, defaultDate) };
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

/** 日次レスポンスを、出所と欠測を失わずにモデル向けへ圧縮する。 */
export function summarizeFitlogDay(raw: FitlogTodayRaw, date: string): Record<string, unknown> {
  const eatenKcal = raw.kcal?.eaten ?? 0;
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
        摂取: `${eatenKcal}kcal`,
        目標: `${targetKcal}kcal`,
        運動日の追加分: raw.kcalBonus ?? { gym: 0, outdoor: 0, total: 0 },
        残り: remainingKcal >= 0 ? `${remainingKcal}kcal` : `超過${Math.abs(remainingKcal)}kcal`,
      },
      PFC: {
        たんぱく質: `${raw.protein?.g ?? 0}g / 目標${raw.protein?.target ?? 0}g`,
        脂質: `${raw.fat?.g ?? 0}g / 目標${raw.fat?.target ?? 0}g`,
        炭水化物: `${raw.carb?.g ?? 0}g / 目標${raw.carb?.target ?? 0}g`,
      },
      食事一覧: meals.length ? meals : '記録なし',
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
      平均摂取: f.avgKcal != null ? `${f.avgKcal}kcal/日` : '記録なし',
      基本目標: f.targetKcal != null ? `${f.targetKcal}kcal/日` : '未設定',
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

function toolFailure(error: unknown, context: Record<string, unknown>): Record<string, unknown> {
  return { error: error instanceof FitlogError ? error.message : 'FIT LOGのデータを取得できませんでした。', ...context };
}

export async function runFitlogDayTool(env: Env, call: ToolCall, today: string): Promise<Record<string, unknown>> {
  const { date } = readFitlogDayArgs(call.args, today);
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
