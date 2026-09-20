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
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'CF-Access-Client-Id': env.HAKSAI_MCP_CLIENT_ID!,
      'CF-Access-Client-Secret': env.HAKSAI_MCP_CLIENT_SECRET!,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  // Access turns away a bad token with a redirect to its login page, so anything
  // that is not a clean 200 means the token, not the question, is the problem.
  if (response.status !== 200) {
    throw new HaksaiError(`HAKSAI に接続できませんでした（${response.status}）。サービストークンの設定を確認してください。`);
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
export function summarize(items: Measured[], title: string, snapshotDate: string | null, warnings: string[]) {
  const order: string[] = [];
  const fine: string[] = [];
  const idle: string[] = [];
  const none: string[] = [];
  let recommended = 0;

  for (const item of items) {
    const state = str(item.plan.state);
    const qty = num(item.plan.recommendedOrderQty) ?? 0;
    if (state === 'urgent' || state === 'order') {
      recommended += qty;
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
