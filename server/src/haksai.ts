/**
 * Reads Amazon stock and ordering out of HAKSAI Central.
 *
 * HAKSAI Central keeps the president's Amazon numbers in its own D1, behind its
 * own read-only MCP server (a separate Worker, a separate Access application).
 * MAYA reaches it as a machine: an Access service token, held here as a Worker
 * secret. The phone never holds it — an app can be unpacked, a Worker secret
 * cannot — so the request goes app → this server → HAKSAI, never app → HAKSAI.
 *
 * Nothing here can write. The MCP server offers no writing tool at all, so the
 * worst a wrong argument can do is read the wrong product.
 *
 * The president asks by product name, never by ASIN, so a lookup is two steps:
 * find the variations, then ask about each one. That second step is one request
 * per size and colour, and a product like pyjamas has dozens, which is why only
 * the best-selling ones are checked — a consultation cannot wait on 36 round
 * trips, and the ones that sell are the ones worth reordering.
 */

import type { ToolCall, ToolDeclaration } from '@/services/llm/geminiClient';

import { presidentDate } from './clock';
import type { Env } from './env';

export const HAKSAI_INVENTORY_TOOL: ToolDeclaration = {
  name: 'haksai_inventory',
  description:
    'Amazon（HAKSAI Central）の在庫と発注の状況を調べます。商品名で探し、サイズ・色ごとの在庫数・日販・在庫日数・発注期限・推奨発注数を返します。' +
    '在庫・発注・補充・仕入れ・欠品の相談のときに使います。読み取りだけで、発注はできません。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          '商品名の一部。「パジャマ メンズ」のように、短い語を空白で区切ります（すべてを含む商品だけが対象）。ASIN が分かっていれば ASIN でも可。',
      },
      limit: {
        type: 'number',
        description: '調べるバリエーションの数。売れている順に調べます。既定15、最大25。',
      },
    },
    required: ['query'],
  },
};

/**
 * Whether the president is asking about the Amazon numbers.
 *
 * A word list, like the past-tense one for memory search (memory/search.ts), for
 * the same measured reason: Flash-Lite, left to decide, does not call a tool. It
 * answers that it cannot see the data and asks to be shown the screen. A wrong
 * guess costs one call, about a second; a miss costs that refusal.
 */
const AMAZON_MARKERS = /在庫|発注|補充|欠品|仕入れ|売上|売り上げ|粗利|広告費|ACOS|Amazon|アマゾン|セラー|FBA|ASIN|売れ筋|売れて|売れた|売れ行き|競合|ライバル|Keepa|ランキング|値下げ|セール/i;

export function refersToAmazon(message: string): boolean {
  return AMAZON_MARKERS.test(message);
}

/** Whether the token is in place. Without it the tool is not offered at all. */
export function haksaiConfigured(env: Env): boolean {
  return Boolean(env.HAKSAI_MCP_URL && env.HAKSAI_MCP_CLIENT_ID && env.HAKSAI_MCP_CLIENT_SECRET);
}

export const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 25;
/** How wide the first search casts before the best sellers are taken. */
const SEARCH_LIMIT = 50;
const ASIN = /^B[A-Z0-9]{9}$/;

export interface InventoryArgs {
  query: string;
  limit: number;
}

/** Reads the model's arguments defensively: it is untrusted input like any other. */
export function readInventoryArgs(args: Record<string, unknown>): InventoryArgs {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const asked = Number(args.limit);
  const limit = Number.isFinite(asked) ? Math.min(Math.max(Math.trunc(asked), 1), MAX_LIMIT) : DEFAULT_LIMIT;
  return { query, limit };
}

interface Envelope {
  data?: Record<string, unknown> | null;
  meta?: { warnings?: unknown };
  error?: unknown;
  message?: unknown;
}

export class HaksaiError extends Error {}

/**
 * The value, without the header name Cloudflare shows beside it.
 *
 * The dashboard prints `CF-Access-Client-Id: <value>`, and copying the whole
 * line is the natural thing to do. It went wrong twice in one day, and both times
 * the only symptom was a redirect to a login page. A value can never begin with a
 * header name, so stripping one loses nothing and removes the mistake.
 */
export function cleanCredential(value: string): string {
  return value.trim().replace(/^CF-Access-Client-(?:Id|Secret)\s*:\s*/i, '').trim();
}

/**
 * One MCP call, over plain JSON-RPC.
 *
 * The MCP server answers a single POST without a session handshake, so the SDK
 * would only add weight to a Worker bundle for a request `fetch` already makes.
 */
export async function callMcp(env: Env, name: string, args: Record<string, unknown>): Promise<Envelope> {
  if (!haksaiConfigured(env)) {
    throw new HaksaiError('HAKSAI の接続が設定されていません。');
  }
  const response = await fetch(env.HAKSAI_MCP_URL!, {
    method: 'POST',
    // A Worker's fetch follows a redirect by default, and the Access login page it
    // lands on answers 200. Following would turn a refused token into "200 but not
    // JSON", which says nothing. The refusal itself is the answer.
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'CF-Access-Client-Id': cleanCredential(env.HAKSAI_MCP_CLIENT_ID!),
      'CF-Access-Client-Secret': cleanCredential(env.HAKSAI_MCP_CLIENT_SECRET!),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  // Access turns away a bad token with a redirect to its login page, so anything
  // that is not a clean 200 means the token, not the question, is the problem.
  if (response.status !== 200) {
    const status = response.status;
    // The number says where it was refused, so it is spelled out for whoever reads the log.
    console.warn(JSON.stringify({ evt: 'haksai_refused', status, tool: name, redirectsToLogin: status >= 300 && status < 400 }));
    throw new HaksaiError(`HAKSAI に接続できませんでした（${status}）。${refusalHint(status)}`);
  }
  const body = (await response.json()) as {
    error?: { message?: string };
    result?: { content?: { type?: string; text?: string }[] };
  };
  if (body.error) {
    throw new HaksaiError(`HAKSAI が要求を受け付けませんでした。${body.error.message ?? ''}`.trim());
  }
  const text = body.result?.content?.find((part) => part.type === 'text')?.text;
  if (!text) {
    throw new HaksaiError('HAKSAI の応答を読み取れませんでした。');
  }
  return JSON.parse(text) as Envelope;
}

/** What a refusal at this number usually means. Guesses at the cause, labelled as such. */
export function refusalHint(status: number): string {
  if (status >= 300 && status < 400) {
    return 'Access がログイン画面へ転送しました。サービストークンの ID か Secret が違うか、そのトークンが HAKSAI の Access ポリシーに入っていない可能性があります。';
  }
  if (status === 401) return '合鍵は Access を通りましたが、HAKSAI サーバーが署名を受け付けませんでした。HAKSAI 側の ACCESS_AUD を確認してください。';
  if (status === 403) return 'HAKSAI サーバーが、この合鍵を許可していません。HAKSAI 側の許可するクライアント（ACCESS_ALLOWED_CLIENT_IDS）を確認してください。';
  if (status === 503) return 'HAKSAI サーバーの認証設定が未完了です。';
  return 'サービストークンの設定を確認してください。';
}

interface Variation {
  asin: string;
  title: string;
  totalUnitsSold: number | null;
}

/** Flattens the search result, which groups variations under their parent ASIN. */
export function readVariations(data: unknown): Variation[] {
  const groups = (data as { groups?: unknown })?.groups;
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group) => {
    const list = (group as { variations?: unknown })?.variations;
    if (!Array.isArray(list)) return [];
    return list.flatMap((item) => {
      const row = item as { asin?: unknown; title?: unknown; totalUnitsSold?: unknown };
      if (typeof row.asin !== 'string') return [];
      return [
        {
          asin: row.asin,
          title: typeof row.title === 'string' ? row.title : row.asin,
          totalUnitsSold: typeof row.totalUnitsSold === 'number' ? row.totalUnitsSold : null,
        },
      ];
    });
  });
}

const tail = (title: string): string[] => {
  const match = title.match(/\(([^()]*)\)\s*$/);
  return match?.[1] ? match[1].split(',').map((part) => part.trim()).filter(Boolean) : [];
};

/**
 * Names each variation in the few words that tell them apart.
 *
 * Amazon titles carry the variation in a trailing bracket — `(JP, アルファベット,
 * M, A08)` — where most of it repeats on every row. Whatever every row shares is
 * dropped rather than matched by name, so a product that varies by something
 * else entirely still reads as itself.
 */
export function variationLabels(items: Variation[]): Map<string, string> {
  const parts = new Map(items.map((item) => [item.asin, tail(item.title)]));
  const shared = new Set<string>(items.length > 1 ? (parts.get(items[0]!.asin) ?? []) : []);
  for (const list of parts.values()) {
    for (const part of [...shared]) if (!list.includes(part)) shared.delete(part);
  }
  return new Map(
    items.map((item) => {
      const kept = (parts.get(item.asin) ?? []).filter((part) => !shared.has(part));
      return [item.asin, kept.length ? kept.join(' ') : item.asin];
    }),
  );
}

/** The product name without the per-variation bracket. */
export function commonTitle(items: Variation[]): string {
  const first = items[0]?.title ?? '';
  return first.replace(/\s*\([^()]*\)\s*$/, '').trim() || first;
}

interface Plan {
  state?: unknown;
  sellingPacePerDay?: unknown;
  coverTotalDays?: unknown;
  orderBy?: unknown;
  runoutDate?: unknown;
  recommendedOrderQty?: unknown;
  fbaStockEstimatedNow?: unknown;
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

interface Measured {
  label: string;
  asin: string;
  stock: number;
  plan: Plan;
  warnings: string[];
}

function readMeasured(label: string, asin: string, envelope: Envelope): Measured {
  const data = envelope.data ?? {};
  const rows = ((data as { snapshot?: { rows?: unknown } }).snapshot?.rows ?? []) as { available?: unknown }[];
  const warnings = Array.isArray(envelope.meta?.warnings)
    ? (envelope.meta.warnings as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
  return {
    label,
    asin,
    stock: rows.reduce((sum, row) => sum + (num(row.available) ?? 0), 0),
    plan: ((data as { plan?: Plan }).plan ?? {}) as Plan,
    warnings,
  };
}

/**
 * Shapes the answer for a small model.
 *
 * Only the rows that need a decision are spelled out. The rest are counted and
 * named, because "nothing to do here" is worth saying but not worth a table.
 */
export function summarize(items: Measured[], title: string, snapshotDate: string | null, warnings: string[], today: string = presidentDate()) {
  const order: string[] = [];
  const lines: string[] = [];
  const fine: string[] = [];
  const idle: string[] = [];
  const none: string[] = [];
  let recommended = 0;

  // Most overdue first, and the urgent ones before those that merely need ordering.
  // The order they arrive in is the order of cumulative sales, which is not the order
  // the president needs to read them in.
  const byUrgency = [...items].sort((a, b) => {
    const rank = (item: Measured) => (str(item.plan.state) === 'urgent' ? 0 : 1);
    return rank(a) - rank(b) || (str(a.plan.orderBy) ?? '9999').localeCompare(str(b.plan.orderBy) ?? '9999');
  });

  for (const item of byUrgency) {
    const state = str(item.plan.state);
    const qty = num(item.plan.recommendedOrderQty) ?? 0;
    if (state === 'urgent' || state === 'order') {
      recommended += qty;
      const by = str(item.plan.orderBy);
      lines.push(
        `${item.label}：在庫${item.stock}、日販${Math.round((num(item.plan.sellingPacePerDay) ?? 0) * 100) / 100}、` +
          `在庫${num(item.plan.coverTotalDays) ?? '?'}日分、発注期限${by ?? '不明'}${by && by < today ? '（期限を過ぎています）' : ''}、推奨${qty}個`,
      );
      order.push(
        JSON.stringify({
          種類: item.label,
          ASIN: item.asin,
          在庫: item.stock,
          日販: Math.round((num(item.plan.sellingPacePerDay) ?? 0) * 100) / 100,
          在庫日数: num(item.plan.coverTotalDays),
          発注期限: str(item.plan.orderBy),
          売切予定: str(item.plan.runoutDate),
          推奨数: qty,
          緊急: state === 'urgent',
        }),
      );
    } else if (state === 'ok') {
      fine.push(`${item.label}（在庫${item.stock}、${num(item.plan.coverTotalDays) ?? '?'}日分）`);
    } else if (state === 'idle') {
      idle.push(`${item.label}（在庫${item.stock}）`);
    } else {
      none.push(item.label);
    }
  }

  return {
    商品: title,
    基準日: snapshotDate,
    調べた数: items.length,
    すぐ発注: order.map((row) => JSON.parse(row) as Record<string, unknown>),
    // 完成した一覧。モデルは、これを書き写す。組み立て直すと、行を落とす。
    すぐ発注の一覧: lines,
    推奨合計: recommended,
    余裕あり: fine,
    動きなし: idle,
    在庫も販売もなし: none,
    注意: warnings,
  };
}

/** Runs the tool call from the model. Failures come back as text, not thrown. */
export async function runHaksaiInventoryTool(env: Env, call: ToolCall): Promise<unknown> {
  const { query, limit } = readInventoryArgs(call.args);
  if (!query) {
    return { error: '商品名を指定してください。' };
  }

  try {
    let items: Variation[];
    let total: number | null = null;
    if (ASIN.test(query.toUpperCase())) {
      items = [{ asin: query.toUpperCase(), title: query.toUpperCase(), totalUnitsSold: null }];
    } else {
      const found = await callMcp(env, 'haksai_search_products', { query, limit: SEARCH_LIMIT });
      items = readVariations(found.data);
      total = items.length;
      if (items.length === 0) {
        return { error: `「${query}」に当てはまる商品が見つかりませんでした。短い語で言い直してください。`, 探した語: query };
      }
      // Already sorted by cumulative sales, so the head is what sells.
      items = items.slice(0, limit);
    }

    const labels = variationLabels(items);
    const envelopes = await Promise.all(items.map((item) => callMcp(env, 'haksai_get_inventory', { asin: item.asin })));
    const measured = items.map((item, index) =>
      readMeasured(labels.get(item.asin) ?? item.asin, item.asin, envelopes[index]!),
    );

    const snapshotDate = str(
      (envelopes.find((envelope) => (envelope.data as { snapshot?: { date?: unknown } })?.snapshot?.date)?.data as
        | { snapshot?: { date?: unknown } }
        | undefined)?.snapshot?.date,
    );
    const warnings = [...new Set(measured.flatMap((item) => item.warnings))];
    warnings.push('推奨発注数は計算値です。最小ロットと、発注済みで未着の数は含みません。');
    if (total !== null && total > items.length) {
      warnings.push(`該当は${total}種類あり、売れている順に${items.length}種類だけ調べました。`);
    }

    return {
      ...summarize(measured, ASIN.test(query.toUpperCase()) ? query.toUpperCase() : commonTitle(items), snapshotDate, warnings),
      出所: 'HAKSAI Central（FBA在庫レポートの手動取込。画面と同じ計算）',
    };
  } catch (error) {
    return { error: error instanceof HaksaiError ? error.message : 'HAKSAI の在庫を読めませんでした。' };
  }
}

export const HAKSAI_SALES_TOOL: ToolDeclaration = {
  name: 'haksai_sales',
  description:
    'Amazon（HAKSAI Central）の、1か月ぶんの売上・粗利・広告費の合計と、売れている上位の商品を調べます。' +
    '「9月の売上は？」「今月どれが売れている？」のように、商品を決めない売上の相談で使います。' +
    '特定の商品の在庫・発注は haksai_inventory を使います。読み取りだけです。',
  parameters: {
    type: 'object',
    properties: {
      month: { type: 'string', description: '月（YYYY-MM）。省略すると今月。' },
      top: { type: 'number', description: '上位の商品の数。既定5、最大15。' },
      sort_by: {
        type: 'string',
        enum: ['sales', 'units', 'gross_profit', 'ad_spend'],
        description: '上位の並び順。既定は sales（売上）。',
      },
    },
  },
};

export interface SalesArgs {
  month: string;
  top: number;
  sortBy: string;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const SORTS = ['sales', 'units', 'gross_profit', 'ad_spend'];

/** Reads the model's arguments defensively. A missing or malformed month means "this month", in the president's time zone. */
export function readSalesArgs(args: Record<string, unknown>, today: string): SalesArgs {
  const month = typeof args.month === 'string' && MONTH.test(args.month.trim()) ? args.month.trim() : today.slice(0, 7);
  const asked = Number(args.top);
  const top = Number.isFinite(asked) ? Math.min(Math.max(Math.trunc(asked), 1), 15) : 5;
  const sortBy = typeof args.sort_by === 'string' && SORTS.includes(args.sort_by) ? args.sort_by : 'sales';
  return { month, top, sortBy };
}

const yen = (value: unknown): number | null => num(value);

/**
 * A yen amount as it should be spoken: 1,790,028 becomes "179.0万円".
 *
 * The model was left to convert, and wrote 1,79万円 for a figure that is 179万円.
 * A small model drops or shifts a digit when it divides by ten thousand, so the
 * division is done here, once, and the model only repeats the string.
 */
export function yenLabel(value: unknown): string | null {
  const n = num(value);
  if (n === null) return null;
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  return abs >= 10_000 ? `${sign}${(abs / 10_000).toFixed(1)}万円` : `${sign}${Math.round(abs).toLocaleString('en-US')}円`;
}

/**
 * Keeps what a decision needs and drops the rest.
 *
 * The month's totals and the few products that carry it. A caveat the source
 * raised — a month still in progress, an unconfirmed profit — travels with the
 * numbers, because "September sales" said without it reads as a finished month.
 */
export function summarizeMonth(envelope: Envelope): Record<string, unknown> {
  const data = (envelope.data ?? {}) as Record<string, unknown>;
  const totals = (data.totals ?? {}) as Record<string, unknown>;
  const ranking = ((data.ranking as { products?: unknown } | undefined)?.products ?? []) as Record<string, unknown>[];
  const warnings = Array.isArray(envelope.meta?.warnings)
    ? (envelope.meta.warnings as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
  return {
    月: str(data.month),
    データの最終日: str(data.lastSaleDate),
    月の途中: data.isPartialMonth === true,
    利益の状態: str(data.profitStatus),
    // 声に出す書き方。金額は、この文字をそのまま使う。
    表示: {
      売上税込: yenLabel(totals.salesTaxIn),
      Amazon手取: yenLabel(totals.netAfterAmazonFees),
      粗利: yenLabel(totals.grossProfit),
      営業利益: yenLabel(totals.operatingProfit),
      広告費: yenLabel(totals.adSpend),
      販売数: yen(totals.units) === null ? null : `${yen(totals.units)}個`,
    },
    合計: {
      売上税込: yen(totals.salesTaxIn),
      Amazon手取: yen(totals.netAfterAmazonFees),
      粗利: yen(totals.grossProfit),
      営業利益: yen(totals.operatingProfit),
      固定費: yen(totals.fixedCosts),
      販売数: yen(totals.units),
      返品数: yen(totals.returnUnits),
      広告費: yen(totals.adSpend),
      広告経由の売上: yen(totals.adSales),
      ACOS百分率: yen(totals.acosPct),
      売れた商品数: yen(totals.productsWithSales),
    },
    上位: ranking.map((item) => ({
      商品: str(item.title),
      ASIN: str(item.asin),
      販売数: yen(item.units),
      売上税込: yen(item.salesTaxIn),
      売上表示: yenLabel(item.salesTaxIn),
      粗利: yen(item.grossProfit),
      広告費: yen(item.adSpend),
    })),
    注意: [...warnings, '利益の数字は、原価が確定した商品だけの計算です。'],
    出所: 'HAKSAI Central（売上レポートの手動取込。画面と同じ計算）',
  };
}

export async function runHaksaiSalesTool(env: Env, call: ToolCall, today: string): Promise<unknown> {
  const { month, top, sortBy } = readSalesArgs(call.args, today);
  try {
    const envelope = await callMcp(env, 'haksai_get_month_summary', { month, top, sort_by: sortBy });
    if (envelope.data == null) {
      const reason = typeof envelope.error === 'string' ? envelope.error : typeof envelope.message === 'string' ? envelope.message : '';
      return { error: `${month} の売上を読めませんでした。${reason}`.trim(), 月: month };
    }
    return summarizeMonth(envelope);
  } catch (error) {
    return { error: error instanceof HaksaiError ? error.message : 'HAKSAI の売上を読めませんでした。' };
  }
}

export const HAKSAI_MARKET_TOOL: ToolDeclaration = {
  name: 'haksai_market',
  description:
    'Amazon（HAKSAI Central）に保存された Keepa の履歴から、商品の価格とランキングの動き、設定してある競合の変化、原価と手数料を調べます。' +
    '「競合が値下げしているけど追随すべき？」「ランキングは動いてる？」の相談で使います。new_price を渡すと、その価格にしたときの1個あたりの粗利と、同じ粗利を保つのに必要な販売数の増え方も返します。' +
    '読み取りだけで、Keepa は呼びません。履歴が未取得の商品は、未取得と返ります。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '商品名の一部（「卓上ベル」など）、または ASIN。' },
      new_price: { type: 'number', description: '試算したい販売価格（円）。値下げに追随するかの相談のときに渡します。' },
    },
    required: ['query'],
  },
};

export interface MarketArgs {
  query: string;
  newPrice: number | null;
}

/** Reads the model's arguments defensively. A price that is not a plain positive yen amount is dropped rather than guessed at. */
export function readMarketArgs(args: Record<string, unknown>): MarketArgs {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const price = Number(args.new_price);
  return { query, newPrice: Number.isFinite(price) && price > 0 && price < 1_000_000 ? Math.round(price) : null };
}

const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const shortDate = (iso: string | null): string => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '?');

/** One product's stored history, as a few lines a model can repeat without recomputing. */
function readHistory(value: unknown): Record<string, unknown> {
  const history = obj(value);
  const asin = str(history.asin);
  if (history.stored !== true) return { ASIN: asin, 状態: '未取得' };
  const price = history.price ? obj(history.price) : null;
  const rank = history.rank ? obj(history.rank) : null;
  const changes = price ? list(price.changes).map(obj) : [];
  return {
    ASIN: asin,
    取得日: str(history.fetchedAt)?.slice(0, 10) ?? null,
    経過日数: num(history.ageDays),
    価格: price
      ? {
          現在: num(price.latestYen),
          最安: num(price.minYen),
          最高: num(price.maxYen),
          // 直近の変更だけ。日付は月/日。
          変更: changes.slice(-5).map((item) => `${shortDate(str(item.date))} ${num(item.fromYen)}円→${num(item.toYen)}円`),
          変更の回数: num(price.changeCount),
        }
      : '履歴なし',
    ランキング: rank
      ? {
          現在: num(rank.latest),
          最高: num(rank.best),
          最低: num(rank.worst),
          週平均: list(rank.weekly)
            .map(obj)
            .slice(-4)
            .map((item) => `${shortDate(str(item.weekStart))}の週 ${num(item.avgRank)}位`),
        }
      : '履歴なし',
  };
}

interface UnitProfit {
  価格: number;
  粗利: number;
  内訳: { FBA手数料: number; 紹介料: number; 原価: number };
}

/** What one unit leaves at a price: price, less the referral fee, the FBA fee and the landed cost. Ads, returns and tax are not in it. */
export function unitProfit(price: number, landed: number, fba: number, referralPct: number): UnitProfit {
  const referral = Math.round((price * referralPct) / 100);
  return { 価格: price, 粗利: Math.round(price - referral - fba - landed), 内訳: { FBA手数料: fba, 紹介料: referral, 原価: landed } };
}

/**
 * The break-even for a price change, worked out here so the model only repeats it.
 * A small model drops a digit when it divides, and this is the number a decision hangs on.
 */
export function priceTrial(now: UnitProfit, next: UnitProfit): Record<string, unknown> {
  const out: Record<string, unknown> = { 今: now, 変更後: next };
  if (next.粗利 <= 0) {
    out.判断材料 = `変更後は1個売るごとに${next.粗利}円で、売るほど赤字か、利益が出ません。`;
  } else if (now.粗利 > 0) {
    const need = Math.max(Math.round((now.粗利 / next.粗利 - 1) * 100), 0);
    out.同じ粗利に必要な販売数の増加百分率 = need;
    out.判断材料 = `1個あたりの粗利が${now.粗利}円から${next.粗利}円になります。今と同じ粗利を出すには、販売数が${need}%増える必要があります。`;
  }
  return out;
}

/**
 * Shapes the stored history, the competitor's changes and the unit economics for a small model.
 * Whatever is missing is named as missing; a fee or cost that is not there is never filled in.
 */
export function summarizeMarket(history: Envelope, product: Envelope, newPrice: number | null): Record<string, unknown> {
  const data = obj(history.data);
  const own = readHistory(data.history);
  const competitor = obj(data.competitor);
  const master = obj(obj(product.data).master);
  const keepa = obj(obj(product.data).keepa);

  const ownHistory = obj(data.history);
  const ownPrice = ownHistory.stored === true && ownHistory.price ? num(obj(ownHistory.price).latestYen) : null;
  const price = ownPrice ?? num(keepa.priceYen);
  const landed = num(master.currentLandedCostYen);
  const fba = num(keepa.fbaFeeYen);
  const pct = num(keepa.referralPct);

  let unit: Record<string, unknown>;
  if (price === null || landed === null || landed <= 0 || fba === null || pct === null) {
    const missing = [
      price === null ? '現在の販売価格' : null,
      landed === null || landed <= 0 ? '原価（着地原価）' : null,
      fba === null ? 'FBA手数料' : null,
      pct === null ? '紹介料率' : null,
    ].filter((item): item is string => item !== null);
    unit = { 試算できません: `${missing.join('・')}が入っていません。推測で補いません。` };
  } else {
    const now = unitProfit(price, landed, fba, pct);
    unit = newPrice === null ? { 今: now } : priceTrial(now, unitProfit(newPrice, landed, fba, pct));
    unit.前提 = '1個あたりの粗利の概算です。広告費・返品・消費税は入っていません。販売数がどう変わるかは、予測していません。';
  }

  const warnings = list(history.meta?.warnings).filter((item): item is string => typeof item === 'string');

  return {
    自社: own,
    競合: competitor.asin
      ? { ...readHistory(competitor.history), 追跡中: competitor.watching === true, 最終確認: str(competitor.lastCheckedAt)?.slice(0, 10) ?? null }
      : '設定されていません',
    競合の変化: list(data.recentEvents)
      .map(obj)
      .slice(0, 5)
      .map((item) => `${shortDate(str(item.date))} ${str(item.label) ?? str(item.kind) ?? ''}`),
    '1個あたりの粗利': unit,
    注意: [
      ...new Set(warnings),
      '価格は Keepa の新品価格です。Buy Box の価格ではなく、クーポン・ポイントの値引きは入っていません。',
      'ランキングは販売数ではありません。競合の値下げと売上の減りが同じ時期でも、原因とは言い切れません。',
      '履歴は直近90日の間引きで、日ごとの細かい動きは分かりません。',
    ],
    出所: 'HAKSAI Central（Keepaの履歴は保存済みのもの。今回は Keepa を呼んでいません）',
  };
}

export async function runHaksaiMarketTool(env: Env, call: ToolCall): Promise<unknown> {
  const { query, newPrice } = readMarketArgs(call.args);
  if (!query) {
    return { error: '商品名か ASIN を指定してください。' };
  }
  try {
    let asin = query.toUpperCase();
    let title = asin;
    if (!ASIN.test(asin)) {
      const found = await callMcp(env, 'haksai_search_products', { query, limit: 5 });
      const first = readVariations(found.data)[0];
      if (!first) {
        return { error: `「${query}」に当てはまる商品が見つかりませんでした。短い語で言い直してください。`, 探した語: query };
      }
      // Sorted by cumulative sales, so the head is the one that sells.
      asin = first.asin;
      title = commonTitle([first]);
    }
    const [history, product] = await Promise.all([
      callMcp(env, 'haksai_get_market_history', { asin }),
      callMcp(env, 'haksai_get_product', { asin }),
    ]);
    if (history.data == null) {
      return { error: `${asin} の市場の履歴を読めませんでした。`, ASIN: asin };
    }
    return { 商品: title, ASIN: asin, ...summarizeMarket(history, product, newPrice) };
  } catch (error) {
    return { error: error instanceof HaksaiError ? error.message : 'HAKSAI の市場の履歴を読めませんでした。' };
  }
}
