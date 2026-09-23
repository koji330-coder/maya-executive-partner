import type { ToolCall, ToolDeclaration } from '@/services/llm/geminiClient';
import type { Env } from './env';

export interface FitlogTodayArgs {
  date: string;
}

/**
 * Fit-Log-D1 の接続設定が揃っているか確認。
 * URL と API キー（またはサービストークン）が存在するときにツールを有効化。
 */
export function fitlogConfigured(env: Env): boolean {
  return Boolean(env.FITLOG_API_URL && (env.FITLOG_API_KEY || (env.FITLOG_CLIENT_ID && env.FITLOG_CLIENT_SECRET)));
}

export class FitlogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FitlogError';
  }
}

/**
 * 質問文が筋トレ・健康・食事・体組成に関わる内容か判定。
 */
export function refersToFitness(message: string): boolean {
  return /(筋トレ|トレーニング|ワークアウト|ジム|運動|有酸素|体重|体脂肪|カロリー|PFC|タンパク質|たんぱく質|脂質|炭水化物|食事|プロテイン|増量|減量|体調|健康|フィットネス|FitLog)/i.test(
    message,
  );
}

export const FITLOG_TODAY_TOOL: ToolDeclaration = {
  name: 'fitlog_today',
  description:
    'FIT LOG D1から、社長の今日の体重・体脂肪率、直近の体重推移、筋トレ・運動の記録、食事内容（摂取カロリーとPFCバランス）、目標との差を調べます。' +
    '「今日の筋トレはどう？」「カロリーどれくらい摂った？」「体重増えてる？」などの健康・コンディションに関する相談で使います。読み取り専用です。',
  parameters: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: '取得したい日付（YYYY-MM-DD）。今日の場合は省略するか、今日のISO日付を渡します。',
      },
    },
  },
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
    kcal: number | null;
  }[];
}

export function cleanCredential(raw: string): string {
  const trimmed = raw.trim();
  const stripped = trimmed.replace(/^[\w-]+:\s*/i, '').trim();
  return stripped.replace(/^Bearer\s+/i, '').trim();
}

export function refusalHint(status: number): string {
  if (status === 401) {
    return 'Fit-Log の APIキーが無効か期限切れです。FITLOG_API_KEY を確認してください。';
  }
  if (status === 403) {
    return 'Cloudflare Access で弾かれました。FITLOG_CLIENT_ID と FITLOG_CLIENT_SECRET を確認してください。';
  }
  if (status === 404) {
    return 'Fit-Log のエンドポイントが見つかりません。FITLOG_API_URL を確認してください。';
  }
  return `Fit-Log がエラー（HTTP ${status}）を返しました。`;
}

export function readFitlogTodayArgs(raw: unknown, defaultDate: string): FitlogTodayArgs {
  if (typeof raw !== 'object' || raw === null) return { date: defaultDate };
  const obj = raw as Record<string, unknown>;
  const dateStr = typeof obj.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.date) ? obj.date : defaultDate;
  return { date: dateStr };
}

/**
 * モデルが解釈しやすいよう、要約して日本語キーで返す。
 * 数値計算の狂いを防ぐため、目標との差や残りカロリーをここで計算する。
 */
export function summarizeFitlogToday(raw: FitlogTodayRaw, date: string): Record<string, unknown> {
  const eatenKcal = raw.kcal?.eaten ?? 0;
  const targetKcal = raw.kcal?.target ?? 0;
  const remainingKcal = targetKcal - eatenKcal;

  const eatenP = raw.protein?.g ?? 0;
  const targetP = raw.protein?.target ?? 0;
  const eatenF = raw.fat?.g ?? 0;
  const targetF = raw.fat?.target ?? 0;
  const eatenC = raw.carb?.g ?? 0;
  const targetC = raw.carb?.target ?? 0;

  const weight = raw.weightKg != null ? `${raw.weightKg}kg` : '未記録';
  const bodyfat = raw.bodyfatPercent != null ? `${raw.bodyfatPercent}%` : '未記録';
  const delta =
    raw.weightDeltaKg != null
      ? `${raw.weightDeltaKg >= 0 ? '+' : ''}${raw.weightDeltaKg}kg`
      : '前日比なし';

  const workouts = (raw.workoutEntries ?? []).map((entry) => {
    if (entry.type === 'strength') {
      const setDetails = entry.sets
        .map((s) => `${s.weight != null ? `${s.weight}kg` : ''}×${s.reps != null ? `${s.reps}回` : ''}`.trim())
        .filter(Boolean)
        .join(', ');
      return `${entry.name} (${entry.sets.length}セット: ${setDetails || '記録あり'})`;
    }
    return `${entry.name} (${entry.time != null ? `${entry.time}分` : ''}${entry.dist != null ? ` ${entry.dist}km` : ''})`.trim();
  });

  const meals = (raw.meals ?? []).map(
    (m) => `${m.time ? `${m.time} ` : ''}[${m.label}] ${m.name || '食事'} (${m.kcal}kcal / P:${m.protein}g F:${m.fat}g C:${m.carb}g)`,
  );

  return {
    対象日: date,
    体組成: {
      体重: weight,
      前日比: delta,
      体脂肪率: bodyfat,
      直近7日体重推移: raw.weightTrend7d && raw.weightTrend7d.length > 0 ? raw.weightTrend7d.map((w) => `${w}kg`).join(' → ') : '記録なし',
    },
    運動状況: {
      筋トレセット数: raw.exercise?.strengthSets ?? 0,
      有酸素分数: raw.exercise?.cardioMinutes ?? 0,
      実施種目: workouts.length > 0 ? workouts : '本日の記録なし',
    },
    食事と栄養: {
      カロリー: {
        摂取: `${eatenKcal}kcal`,
        目標: `${targetKcal}kcal`,
        残り: remainingKcal >= 0 ? `${remainingKcal}kcal` : `超過 ${Math.abs(remainingKcal)}kcal`,
      },
      PFCバランス: {
        たんぱく質: `${eatenP}g / 目標 ${targetP}g (${targetP > 0 ? Math.round((eatenP / targetP) * 100) : 0}%)`,
        脂質: `${eatenF}g / 目標 ${targetF}g (${targetF > 0 ? Math.round((eatenF / targetF) * 100) : 0}%)`,
        炭水化物: `${eatenC}g / 目標 ${targetC}g (${targetC > 0 ? Math.round((eatenC / targetC) * 100) : 0}%)`,
      },
      本日の食事一覧: meals.length > 0 ? meals : '本日の記録なし',
    },
    出所: 'FIT LOG D1（データベース実測値）',
  };
}

/**
 * Fit-Log API を呼び出す
 */
export async function fetchFitlogToday(env: Env, dateStr: string): Promise<FitlogTodayRaw> {
  if (!fitlogConfigured(env)) {
    throw new FitlogError('FIT LOG の接続が設定されていません。');
  }

  const baseUrl = env.FITLOG_API_URL!.replace(/\/+$/, '');
  const url = `${baseUrl}/today?date=${encodeURIComponent(dateStr)}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (env.FITLOG_API_KEY) {
    headers['Authorization'] = `Bearer ${cleanCredential(env.FITLOG_API_KEY)}`;
  }

  if (env.FITLOG_CLIENT_ID && env.FITLOG_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = cleanCredential(env.FITLOG_CLIENT_ID);
    headers['CF-Access-Client-Secret'] = cleanCredential(env.FITLOG_CLIENT_SECRET);
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    redirect: 'manual',
  });

  if (!response.ok) {
    throw new FitlogError(refusalHint(response.status));
  }

  const json = (await response.json()) as FitlogTodayRaw;
  return json;
}

/**
 * LLM からの fitlog_today Tool 呼び出しハンドラ
 */
export async function runFitlogTodayTool(env: Env, call: ToolCall, today: string): Promise<Record<string, unknown>> {
  const { date } = readFitlogTodayArgs(call.args, today);

  try {
    const raw = await fetchFitlogToday(env, date);
    return summarizeFitlogToday(raw, date);
  } catch (error) {
    return {
      error: error instanceof FitlogError ? error.message : 'FIT LOG のデータを取得できませんでした。',
      対象日: date,
    };
  }
}
