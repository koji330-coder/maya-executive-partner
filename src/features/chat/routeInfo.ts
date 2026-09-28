/**
 * How one answer was reached: which router decided, which tools were read,
 * how many model rounds it took. The server sends it with every reply so the
 * president can follow, answer by answer, what Jev routing changes; the phone
 * keeps it with the conversation. Numbers and tool names only, never text.
 */

export type RouterMode = 'off' | 'assist';

/**
 * - legacy: routing is off; the regex narrows and Gemini decides (as before Jev)
 * - legacy_fallback: routing is on but Jev could not answer in time, so legacy
 * - direct_none: Jev was sure no data is needed; one round, no tools offered
 * - direct_rule: as direct_none, but a fixed rule read one tool first
 * - direct_prefetch: Jev was sure which tool; the server read it first, one round
 * - fallback_topp: Jev was unsure; Gemini chose among Jev's likeliest tools
 */
export type RouteKind =
  | 'legacy'
  | 'legacy_fallback'
  | 'direct_none'
  | 'direct_rule'
  | 'direct_prefetch'
  | 'fallback_topp';

export interface JevRouteDecision {
  required: string;
  confidence: number;
  period: string;
  /** Logged only; not used to route yet. */
  useful: string;
  usefulConfidence: number;
  /** Logged only; not used to route yet. */
  contextSufficient: number;
  latencyMs: number;
  inputTokens: number;
}

export interface RouteInfo {
  mode: RouterMode;
  route: RouteKind;
  /** Why Jev was skipped: no_key, timeout, http_5xx, http_4xx, invalid, network, attachments. */
  jevError?: string;
  jev?: JevRouteDecision;
  rule?: { id: string; title: string };
  /** Tools the server read before asking Gemini. */
  prefetched: string[];
  /** Tools Gemini was offered. */
  offered: string[];
  /** Tools Gemini called. */
  toolsCalled: string[];
  rounds: number;
  /** Server time for the whole turn. */
  latencyMs: number;
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
}

const ROUTE_LABEL: Record<RouteKind, string> = {
  legacy: '従来',
  legacy_fallback: '従来（Jev 不通）',
  direct_none: 'データ不要',
  direct_rule: '固定ルール',
  direct_prefetch: '先読み',
  fallback_topp: '候補を絞って Gemini',
};

const ROUTE_KINDS = new Set<string>(Object.keys(ROUTE_LABEL));

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** Reads route info from the server or storage; null when it is not there or not recognisable. */
export function parseRouteInfo(value: unknown): RouteInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.route !== 'string' || !ROUTE_KINDS.has(v.route)) return null;
  const jev = v.jev as Record<string, unknown> | undefined;
  const rule = v.rule as Record<string, unknown> | undefined;
  return {
    mode: v.mode === 'assist' ? 'assist' : 'off',
    route: v.route as RouteKind,
    jevError: typeof v.jevError === 'string' ? v.jevError : undefined,
    jev:
      jev && typeof jev.required === 'string'
        ? {
            required: jev.required,
            confidence: num(jev.confidence),
            period: typeof jev.period === 'string' ? jev.period : '',
            useful: typeof jev.useful === 'string' ? jev.useful : '',
            usefulConfidence: num(jev.usefulConfidence),
            contextSufficient: num(jev.contextSufficient),
            latencyMs: num(jev.latencyMs),
            inputTokens: num(jev.inputTokens),
          }
        : undefined,
    rule: rule && typeof rule.id === 'string' ? { id: rule.id, title: String(rule.title ?? '') } : undefined,
    prefetched: strings(v.prefetched),
    offered: strings(v.offered),
    toolsCalled: strings(v.toolsCalled),
    rounds: num(v.rounds),
    latencyMs: num(v.latencyMs),
    promptTokens: num(v.promptTokens),
    outputTokens: num(v.outputTokens),
    thoughtsTokens: num(v.thoughtsTokens),
  };
}

const pct = (value: number) => `${Math.round(value * 100)}%`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}秒`;

/** One line under the answer: the route, what Jev thought, rounds and time. */
export function formatRouteSummary(route: RouteInfo): string {
  const parts = [ROUTE_LABEL[route.route]];
  if (route.jev) parts.push(`Jev ${route.jev.required} ${pct(route.jev.confidence)}`);
  const tools = [...route.prefetched, ...route.toolsCalled];
  parts.push(tools.length > 0 ? tools.join('・') : '道具なし');
  parts.push(`${route.rounds}往復`, seconds(route.latencyMs));
  return parts.join(' / ');
}

/** The expanded view: everything the route carries, one fact per line. */
export function formatRouteDetail(route: RouteInfo): string[] {
  const lines = [`経路: ${ROUTE_LABEL[route.route]}（${route.route}）・モード ${route.mode}`];
  if (route.jevError) lines.push(`Jev を使わなかった理由: ${route.jevError}`);
  if (route.jev) {
    const jev = route.jev;
    lines.push(
      `Jev 必要な道具: ${jev.required}（${pct(jev.confidence)}）・期間 ${jev.period || '—'}・${jev.latencyMs}ms`,
      `Jev 参考（経路には未使用）: あると良い道具 ${jev.useful}（${pct(jev.usefulConfidence)}）・会話に答えがある ${pct(jev.contextSufficient)}`,
    );
  }
  if (route.rule) lines.push(`固定ルール: ${route.rule.title}`);
  if (route.prefetched.length) lines.push(`先に読んだ道具: ${route.prefetched.join('・')}`);
  lines.push(`Gemini に見せた道具: ${route.offered.length ? route.offered.join('・') : 'なし'}`);
  lines.push(`Gemini が呼んだ道具: ${route.toolsCalled.length ? route.toolsCalled.join(' → ') : 'なし'}`);
  lines.push(
    `Gemini ${route.rounds}往復・入力 ${route.promptTokens} / 出力 ${route.outputTokens} / 思考 ${route.thoughtsTokens} トークン・全体 ${seconds(route.latencyMs)}`,
  );
  return lines;
}
