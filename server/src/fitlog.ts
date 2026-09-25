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
  return /(筋トレ|トレーニング|ワークアウト|ジム|運動|有酸素|屋外|アウトドア|散歩|ウォーキング|ランニング|ジョギング|サイクリング|自転車|ハイキング|登山|歩いた|走った|歩数|体重|体脂肪|カロリー|PFC|タンパク質|たんぱく質|脂質|炭水化物|食事|プロテイン|増量|減量|体調|健康|フィットネス|FitLog|FIT LOG)/i.test(
    message,
  );
}

export const FITLOG_TODAY_TOOL: ToolDeclaration = {
  name: 'fitlog_today',
  description:
    'FIT LOG D1から、社長のその日の体重・体脂肪率（記録日つき）、直近の体重の記録、筋トレ・有酸素の記録、屋外活動（ウォーキング・ランニング・サイクリング等）、食事内容（摂取カロリーとPFCバランス）、目標との差を調べます。' +
    '「今日の筋トレはどう？」「今日どれくらい歩いた？」「カロリーどれくらい摂った？」「体重増えてる？」などの健康・コンディションに関する相談で使います。読み取り専用です。',
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
  /** 対象日ちょうどの体重記録があるか。false のとき weightKg は、それより前の直近の記録。 */
  hasBodyMetrics?: boolean;
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

/** 体重・体脂肪率の1日1行の記録（GET /body-metrics/history）。 */
export interface BodyRecord {
  date: string;
  weight: number | null;
  bodyfat: number | null;
}

const OUTDOOR_LABELS: Record<string, string> = {
  walking: 'ウォーキング',
  running: 'ランニング',
  cycling: 'サイクリング',
  other: 'その他',
};

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
export function summarizeFitlogToday(
  raw: FitlogTodayRaw,
  date: string,
  history: BodyRecord[] | null = null,
): Record<string, unknown> {
  const eatenKcal = raw.kcal?.eaten ?? 0;
  const targetKcal = raw.kcal?.target ?? 0;
  const remainingKcal = targetKcal - eatenKcal;

  const eatenP = raw.protein?.g ?? 0;
  const targetP = raw.protein?.target ?? 0;
  const eatenF = raw.fat?.g ?? 0;
  const targetF = raw.fat?.target ?? 0;
  const eatenC = raw.carb?.g ?? 0;
  const targetC = raw.carb?.target ?? 0;

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

  const outdoorLogs = raw.outdoor ?? [];
  const outdoor = outdoorLogs.map((o) => {
    const label = o.activityType ? (OUTDOOR_LABELS[o.activityType] ?? o.activityType) : '屋外活動';
    const details = [
      o.duration != null ? `${o.duration}分` : null,
      o.distance != null ? `${o.distance}km` : null,
      o.kcal != null ? `${o.kcal}kcal` : null,
    ].filter(Boolean);
    return `${o.time ? `${o.time} ` : ''}${label}${details.length > 0 ? ` (${details.join(' / ')})` : ''}`;
  });
  const outdoorKcal = outdoorLogs.reduce((sum, o) => sum + (o.kcal ?? 0), 0);

  const bonus = raw.kcalBonus;
  const targetBreakdown =
    bonus && bonus.total > 0
      ? `基本 ${targetKcal - bonus.total}kcal + ジム日 ${bonus.gym}kcal + 屋外活動 ${bonus.outdoor}kcal`
      : null;

  const meals = (raw.meals ?? []).map(
    (m) => `${m.time ? `${m.time} ` : ''}[${m.label}] ${m.name || '食事'} (${m.kcal}kcal / P:${m.protein}g F:${m.fat}g C:${m.carb}g)`,
  );

  return {
    対象日: date,
    体組成: history ? bodyFromHistory(history, date) : bodyFromToday(raw, date),
    運動状況: {
      筋トレセット数: raw.exercise?.strengthSets ?? 0,
      有酸素分数: raw.exercise?.cardioMinutes ?? 0,
      実施種目: workouts.length > 0 ? workouts : '記録なし',
    },
    屋外活動: {
      記録: outdoor.length > 0 ? outdoor : '記録なし',
      消費カロリー合計: `${outdoorKcal}kcal`,
    },
    食事と栄養: {
      カロリー: {
        摂取: `${eatenKcal}kcal`,
        目標: `${targetKcal}kcal`,
        ...(targetBreakdown ? { 目標の内訳: targetBreakdown } : {}),
        残り: remainingKcal >= 0 ? `${remainingKcal}kcal` : `超過 ${Math.abs(remainingKcal)}kcal`,
      },
      PFCバランス: {
        たんぱく質: `${eatenP}g / 目標 ${targetP}g (${targetP > 0 ? Math.round((eatenP / targetP) * 100) : 0}%)`,
        脂質: `${eatenF}g / 目標 ${targetF}g (${targetF > 0 ? Math.round((eatenF / targetF) * 100) : 0}%)`,
        炭水化物: `${eatenC}g / 目標 ${targetC}g (${targetC > 0 ? Math.round((eatenC / targetC) * 100) : 0}%)`,
      },
      食事一覧: meals.length > 0 ? meals : '記録なし',
    },
    出所: 'FIT LOG D1（データベース実測値）',
  };
}

const signed = (n: number): string => `${n >= 0 ? '+' : ''}${Math.round(n * 10) / 10}kg`;

/**
 * 体重を、記録日つきで返す。
 *
 * /today は、対象日に記録がない日も直近の体重を weightKg に入れて返す（入力欄の
 * 初期値のため）。そのまま渡すと、数日前の体重を「今日の体重」として話してしまう。
 * 日付つきの履歴から、どの日の記録かを添える。
 */
export function bodyFromHistory(history: BodyRecord[], date: string): Record<string, unknown> {
  const past = history.filter((r) => r.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  const weights = past.filter((r) => r.weight != null);
  const latest = weights.at(-1);
  const previous = weights.at(-2);
  const fat = past.filter((r) => r.bodyfat != null).at(-1);

  return {
    体重: latest ? `${latest.weight}kg（${latest.date}の記録）` : '記録なし',
    体重の記録日: latest?.date ?? null,
    対象日の体重記録: latest?.date === date ? 'あり' : `なし${latest ? `。${latest.date}の記録を表示` : ''}`,
    前回記録比: latest && previous ? `${signed(latest.weight! - previous.weight!)}（${previous.date}比）` : '比較できる記録なし',
    体脂肪率: fat ? `${fat.bodyfat}%（${fat.date}の記録）` : '記録なし',
    直近の体重記録: weights.length > 0 ? weights.slice(-7).map((r) => `${r.date} ${r.weight}kg`) : '記録なし',
  };
}

/** 履歴が読めなかったときの代わり。記録日は分からないので、分からないと書く。 */
export function bodyFromToday(raw: FitlogTodayRaw, date: string): Record<string, unknown> {
  const recordedOn =
    raw.hasBodyMetrics === true ? `${date}の記録` : raw.hasBodyMetrics === false ? `${date}より前の直近の記録。記録日は不明` : '記録日は不明';
  return {
    体重: raw.weightKg != null ? `${raw.weightKg}kg（${recordedOn}）` : '記録なし',
    体重の記録日: raw.hasBodyMetrics === true ? date : null,
    対象日の体重記録: raw.hasBodyMetrics === true ? 'あり' : raw.hasBodyMetrics === false ? 'なし' : '不明',
    前回記録比: raw.weightDeltaKg != null ? signed(raw.weightDeltaKg) : '比較できる記録なし',
    体脂肪率: raw.bodyfatPercent != null ? `${raw.bodyfatPercent}%（${recordedOn}）` : '記録なし',
    直近の体重記録:
      raw.weightTrend7d && raw.weightTrend7d.length > 0 ? raw.weightTrend7d.map((w) => `${w}kg`).join(' → ') + '（日付なし・古い順）' : '記録なし',
  };
}

function fitlogHeaders(env: Env): Record<string, string> {
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
  return headers;
}

const DAY_MS = 86_400_000;

/**
 * 体重の日付つき履歴。/body-metrics/history の days は「今日から何日前まで」なので、
 * 過去の日を訊かれたときは、その日の少し前まで届くように広げる。
 * 読めなければ null（体重は /today の値に、記録日不明と添えて答える）。
 */
export async function fetchBodyHistory(env: Env, dateStr: string, today: string): Promise<BodyRecord[] | null> {
  const back = Math.max(0, Math.round((Date.parse(today) - Date.parse(dateStr)) / DAY_MS));
  const days = Math.min((Number.isFinite(back) ? back : 0) + 30, 400);
  const baseUrl = env.FITLOG_API_URL!.replace(/\/+$/, '');
  try {
    const response = await fetch(`${baseUrl}/body-metrics/history?days=${days}`, {
      method: 'GET',
      headers: fitlogHeaders(env),
      redirect: 'manual',
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { history?: unknown };
    if (!Array.isArray(json.history)) return null;
    return json.history.filter(
      (r): r is BodyRecord => typeof r === 'object' && r !== null && typeof (r as BodyRecord).date === 'string',
    );
  } catch {
    return null;
  }
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

  const response = await fetch(url, {
    method: 'GET',
    headers: fitlogHeaders(env),
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
    const [raw, history] = await Promise.all([fetchFitlogToday(env, date), fetchBodyHistory(env, date, today)]);
    return summarizeFitlogToday(raw, date, history);
  } catch (error) {
    return {
      error: error instanceof FitlogError ? error.message : 'FIT LOG のデータを取得できませんでした。',
      対象日: date,
    };
  }
}
