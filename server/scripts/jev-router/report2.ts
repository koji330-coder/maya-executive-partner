/**
 * Report for E2E v2. Main measures: tool choice, rounds, tokens, latency,
 * cost and how repeatable each is over the reps. Answer quality (the judge)
 * comes last and is a supporting signal. Writes report.md and samples.md.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { CASES, type RouterCase } from './cases.ts';
import { percentile } from './metrics.ts';
import type { FetchedData, PipelineResult } from './pipelines.ts';
import { FLOOR_PROBABILITY, TOPP_MASS } from './pipelines2.ts';
import { NONE } from './tools.ts';
import { PIPELINES, resultFor, type PipelineName, type V2Row } from './v2shared.ts';

/**
 * ASSUMED, not measured: sequential requests each real tool makes (read from
 * server/src), times an assumed 400 ms per request. search_memory is a local
 * D1 query. Keepa fetches in haksai_market are not counted.
 */
export const HOP_MS = 400;
export const TOOL_HOPS: Record<string, number> = {
  search_memory: 0.25,
  haksai_inventory: 2,
  haksai_sales: 1,
  haksai_market: 3,
  fitlog_day: 1,
  fitlog_progress: 1,
  fitlog_weekly: 1,
  fitlog_exercise: 1,
  voice_recent: 1,
  voice_search: 1,
  voice_detail: 1,
  voice_actions: 1,
};

/** Assumed tool time: calls made together (one round, or one prefetch) run in parallel. */
export function assumedToolMs(fetched: FetchedData[]): number {
  const sorted = [...fetched].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  let total = 0;
  let groupStart: number | null = null;
  let groupMax = 0;
  for (const item of sorted) {
    const at = item.at ?? 0;
    const ms = (TOOL_HOPS[item.tool] ?? 1) * HOP_MS;
    if (groupStart === null || at - groupStart > 200) {
      total += groupMax;
      groupStart = at;
      groupMax = ms;
    } else {
      groupMax = Math.max(groupMax, ms);
    }
  }
  return total + groupMax;
}

const caseById = new Map(CASES.map((c) => [c.id, c]));

function allowedRequired(c: RouterCase): string[] {
  return [c.expected, ...(c.acceptable ?? [])].filter((tool) => tool !== NONE);
}
function usefulSet(c: RouterCase): string[] {
  return c.useful ? [c.useful, ...(c.usefulAcceptable ?? [])] : [];
}
function fetchedTools(result: PipelineResult): string[] {
  return [...new Set(result.fetched.map((item) => item.tool))];
}

/** The expected data was fetched (or, when none is expected, nothing was required). */
function requiredOk(c: RouterCase, result: PipelineResult): boolean {
  if (result.error) return false;
  const allowed = allowedRequired(c);
  const noneAllowed = c.expected === NONE || (c.acceptable ?? []).includes(NONE);
  if (noneAllowed) return true;
  return fetchedTools(result).some((tool) => allowed.includes(tool));
}

/** Tools fetched that the case does not call for (required, acceptable or useful). */
function overFetched(c: RouterCase, result: PipelineResult): string[] {
  if (c.contextSufficient) return fetchedTools(result);
  const fine = new Set([...allowedRequired(c), ...usefulSet(c)]);
  return fetchedTools(result).filter((tool) => !fine.has(tool));
}

const avg = (values: number[]) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);
const fmt = (value: number | null, digits = 0) =>
  value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const pct = (count: number, total: number) => (total === 0 ? '—' : `${((count / total) * 100).toFixed(0)}% (${count}/${total})`);

function byCase(rows: V2Row[]): Map<string, V2Row[]> {
  const map = new Map<string, V2Row[]>();
  for (const row of rows) map.set(row.case_id, [...(map.get(row.case_id) ?? []), row]);
  return map;
}

function jevPathOf(row: V2Row): string {
  if (!row.turn.jev) return 'jev_error';
  if (row.turn.direct) return `direct:${row.turn.direct.reason}`;
  return 'fallback';
}

export function renderV2(rows: V2Row[], threshold: number, outDir: string): string {
  const reps = Math.max(...rows.map((row) => row.rep));
  const cases = byCase(rows);
  const lines: string[] = [
    '# Jev 組み込み E2E v2 評価',
    '',
    `- 実行: ${new Date().toISOString()} / ケース ${cases.size} × ${reps} 回 = ${rows.length} ターン`,
    `- Gemini: gemini-3.8-flash / Jev: jev-1.13.0（context_sufficient・required_tool・useful_tool・period を1回で取得）/ しきい値 ${threshold}`,
    `- 自信が低いときの候補集合: all＝現行と同じ、topp＝確率の上位から累積 ${TOPP_MASS * 100}% まで、floor＝確率 ${FLOOR_PROBABILITY * 100}% 以上`,
    '- Jev が自信を持ったターン（direct）は、3つの jev_* で同じ結果を共有する。違いが出るのは fallback だけ。',
    `- 道具の所要時間の「仮定込み」は実測ではない。実際の道具が順に投げる要求の数 × ${HOP_MS}ms を仮定して足したもの。`,
    '',
  ];

  // --- main table --------------------------------------------------------
  lines.push('## 主指標（全ターン）', '');
  lines.push(`| | ${PIPELINES.join(' | ')} |`, `|---|${PIPELINES.map(() => '---').join('|')}|`);
  const stat = (fn: (row: V2Row, result: PipelineResult, c: RouterCase) => number | null) =>
    PIPELINES.map((name) => {
      const values = rows
        .map((row) => fn(row, resultFor(row.turn, name), caseById.get(row.case_id)!))
        .filter((value): value is number => value !== null);
      return values;
    });
  const rowOf = (label: string, values: number[][], render: (v: number[]) => string) =>
    lines.push(`| ${label} | ${values.map(render).join(' | ')} |`);
  const mean = (digits = 0) => (v: number[]) => fmt(avg(v), digits);
  const rate = (v: number[]) => pct(v.filter((x) => x === 1).length, v.length);

  rowOf('必要なデータを取った', stat((_r, res, c) => (requiredOk(c, res) ? 1 : 0)), rate);
  rowOf('余計なデータを取った（ターン率）', stat((_r, res, c) => (overFetched(c, res).length > 0 ? 1 : 0)), rate);
  rowOf('道具の呼び出し 平均回数', stat((_r, res) => res.toolsCalled.length), mean(2));
  rowOf('Gemini 往復 平均', stat((_r, res) => (res.error ? null : res.geminiRounds)), mean(2));
  rowOf('入力トークン 平均', stat((_r, res) => (res.error ? null : res.promptTokens)), mean());
  rowOf('出力トークン 平均', stat((_r, res) => (res.error ? null : res.outputTokens)), mean());
  rowOf('思考トークン 平均', stat((_r, res) => (res.error ? null : res.thoughtsTokens)), mean());
  rowOf('費用 / ターン（Jev 込み）', stat((_r, res) => res.costUsd), (v) => `$${fmt(avg(v), 5)}`);
  rowOf('応答時間 平均（実測）', stat((_r, res) => (res.error ? null : res.latencyMs)), (v) => `${fmt(avg(v))} ms`);
  rowOf('応答時間 p50（実測）', stat((_r, res) => (res.error ? null : res.latencyMs)), (v) => `${fmt(percentile(v, 50))} ms`);
  rowOf('応答時間 p95（実測）', stat((_r, res) => (res.error ? null : res.latencyMs)), (v) => `${fmt(percentile(v, 95))} ms`);
  rowOf('応答時間 平均（道具の仮定込み）', stat((_r, res) => (res.error ? null : res.latencyMs + assumedToolMs(res.fetched))), (v) => `${fmt(avg(v))} ms`);
  rowOf('応答時間 p95（道具の仮定込み）', stat((_r, res) => (res.error ? null : res.latencyMs + assumedToolMs(res.fetched))), (v) => `${fmt(percentile(v, 95))} ms`);
  rowOf('エラー', stat((_r, res) => (res.error ? 1 : 0)), (v) => String(v.filter((x) => x === 1).length));
  lines.push('');

  // --- tool choice detail --------------------------------------------------
  const labeled = (filter: (c: RouterCase) => boolean) => rows.filter((row) => filter(caseById.get(row.case_id)!));
  lines.push('## Tool 選択の内訳', '');
  lines.push(`| | ${PIPELINES.join(' | ')} |`, `|---|${PIPELINES.map(() => '---').join('|')}|`);
  const sub = (label: string, subset: V2Row[], fn: (c: RouterCase, res: PipelineResult) => boolean) =>
    lines.push(
      `| ${label} | ${PIPELINES.map((name) => pct(subset.filter((row) => fn(caseById.get(row.case_id)!, resultFor(row.turn, name))).length, subset.length)).join(' | ')} |`,
    );
  sub('Tool 不要の質問（B）で何も取らない', labeled((c) => c.category === 'B_none' && !c.contextSufficient), (_c, res) => res.fetched.length === 0);
  sub('会話に答えがある（contextSufficient）で何も取らない', labeled((c) => c.contextSufficient === true), (_c, res) => res.fetched.length === 0);
  sub('本人向けの質問（useful 付き）で useful を取った', labeled((c) => Boolean(c.useful)), (c, res) => fetchedTools(res).some((t) => usefulSet(c).includes(t)));
  sub('Tool が必要な質問で必要なデータを取った', labeled((c) => c.expected !== NONE), (c, res) => requiredOk(c, res));
  sub('Tool が必要な質問で余計なデータも取った', labeled((c) => c.expected !== NONE), (c, res) => overFetched(c, res).length > 0);
  lines.push('');

  // --- reproducibility -----------------------------------------------------
  lines.push('## 再現性（同じケースを ' + reps + ' 回）', '');
  const complete = [...cases.values()].filter((list) => list.length === reps);
  const stable = (fn: (row: V2Row) => string) => complete.filter((list) => new Set(list.map(fn)).size === 1).length;
  lines.push(`| | ${PIPELINES.join(' | ')} |`, `|---|${PIPELINES.map(() => '---').join('|')}|`);
  lines.push(
    `| 取った道具の組み合わせが毎回同じ | ${PIPELINES.map((name) => pct(stable((row) => fetchedTools(resultFor(row.turn, name)).sort().join('+')), complete.length)).join(' | ')} |`,
  );
  lines.push(
    `| 往復回数が毎回同じ | ${PIPELINES.map((name) => pct(stable((row) => String(resultFor(row.turn, name).geminiRounds)), complete.length)).join(' | ')} |`,
  );
  const cv = (name: PipelineName) =>
    avg(
      complete.map((list) => {
        const values = list.map((row) => resultFor(row.turn, name).latencyMs);
        const m = avg(values)!;
        const sd = Math.sqrt(avg(values.map((v) => (v - m) ** 2))!);
        return m === 0 ? 0 : sd / m;
      }),
    );
  lines.push(`| 応答時間のばらつき（変動係数の平均） | ${PIPELINES.map((name) => fmt(cv(name), 2)).join(' | ')} |`);
  lines.push('');
  lines.push(`- Jev の経路（direct の理由 / fallback）が毎回同じ: ${pct(stable(jevPathOf), complete.length)}`);
  lines.push(`- Jev の required_tool が毎回同じ: ${pct(stable((row) => row.turn.jev?.required.choice ?? '-'), complete.length)}`);
  lines.push(`- fallback の topp 集合が毎回同じ（毎回 fallback だったケース）: ${pct(complete.filter((l) => l.every((r) => r.turn.sets)).filter((l) => new Set(l.map((r) => r.turn.sets!.topp.sort().join(','))).size === 1).length, complete.filter((l) => l.every((r) => r.turn.sets)).length)}`);
  lines.push('');

  // --- Jev decisions -------------------------------------------------------
  const withJev = rows.filter((row) => row.turn.jev);
  const direct = withJev.filter((row) => row.turn.direct);
  lines.push('## Jev の判断', '');
  lines.push(`- direct（Gemini 1往復）になった: ${pct(direct.length, withJev.length)} — 内訳 context ${direct.filter((r) => r.turn.direct!.reason === 'context').length} / none ${direct.filter((r) => r.turn.direct!.reason === 'none').length} / required ${direct.filter((r) => r.turn.direct!.reason === 'required').length}`);
  lines.push(`- useful を先に取った: ${direct.filter((r) => r.turn.direct!.fetched.some((f) => f.prefetched && f.tool === r.turn.jev!.useful.choice)).length} ターン`);
  const cs = withJev.filter((row) => caseById.get(row.case_id)!.contextSufficient !== undefined);
  const csTrue = cs.filter((row) => caseById.get(row.case_id)!.contextSufficient);
  const csFalse = cs.filter((row) => !caseById.get(row.case_id)!.contextSufficient);
  lines.push(
    `- context_sufficient（ラベル付き ${cs.length} ターン）: 答えが会話にあるのに ≥${threshold} と言えた ${pct(csTrue.filter((r) => r.turn.jev!.contextSufficient >= threshold).length, csTrue.length)} / 会話に無いのに ≥${threshold} と言った（危険側） ${pct(csFalse.filter((r) => r.turn.jev!.contextSufficient >= threshold).length, csFalse.length)}`,
  );
  const reqOk = (row: V2Row) => {
    const c = caseById.get(row.case_id)!;
    return [c.expected, ...(c.acceptable ?? [])].includes(row.turn.jev!.required.choice);
  };
  const reqSure = withJev.filter((row) => row.turn.jev!.required.confidence >= threshold);
  lines.push(`- required_tool の正解率: ${pct(withJev.filter(reqOk).length, withJev.length)} / ≥${threshold} の答えの正解率 ${pct(reqSure.filter(reqOk).length, reqSure.length)}`);
  const useful = withJev.filter((row) => caseById.get(row.case_id)!.useful);
  const usefulOk = (row: V2Row) => usefulSet(caseById.get(row.case_id)!).includes(row.turn.jev!.useful.choice);
  const usefulSure = withJev.filter((row) => row.turn.jev!.useful.confidence >= threshold && row.turn.jev!.useful.choice !== NONE);
  lines.push(`- useful_tool（ラベル付き ${useful.length} ターン）の正解率: ${pct(useful.filter(usefulOk).length, useful.length)} / そのうち ≥${threshold}: ${pct(useful.filter((r) => usefulOk(r) && r.turn.jev!.useful.confidence >= threshold).length, useful.length)}`);
  lines.push(`- useful_tool を ≥${threshold} で none 以外にした全ターン: ${usefulSure.length}（うちラベル無しのケース ${usefulSure.filter((r) => !caseById.get(r.case_id)!.useful).length}）`);
  lines.push(`- Jev の遅延 平均 ${fmt(avg(withJev.map((r) => r.turn.jev!.latencyMs)))} ms / 入力トークン 平均 ${fmt(avg(withJev.map((r) => r.turn.jev!.inputTokens)))}`);
  lines.push('');

  const wrongSure = reqSure.filter((row) => !reqOk(row));
  if (wrongSure.length > 0) {
    lines.push(`### required_tool を ≥${threshold} で外したターン`, '', '| case | rep | 発話 | expected | Jev | confidence |', '|---|---|---|---|---|---|');
    for (const row of wrongSure) {
      const c = caseById.get(row.case_id)!;
      lines.push(`| ${c.id} | ${row.rep} | ${c.message} | ${c.expected} | ${row.turn.jev!.required.choice} | ${fmt(row.turn.jev!.required.confidence * 100)}% |`);
    }
    lines.push('');
  }

  // --- candidate sets ------------------------------------------------------
  const fb = rows.filter((row) => row.turn.sets);
  const recall = (key: 'topp' | 'floor' | 'offered') => {
    const needTool = fb.filter((row) => caseById.get(row.case_id)!.expected !== NONE);
    return pct(needTool.filter((row) => allowedRequired(caseById.get(row.case_id)!).some((t) => row.turn.sets![key].includes(t))).length, needTool.length);
  };
  lines.push('## fallback の候補集合', '', `fallback になった ${fb.length} ターン。`, '');
  lines.push('| | all（現行） | topp | floor |', '|---|---|---|---|');
  lines.push(`| 候補の数 平均 | ${fmt(avg(fb.map((r) => r.turn.sets!.offered.length)), 1)} | ${fmt(avg(fb.map((r) => r.turn.sets!.topp.length)), 1)} | ${fmt(avg(fb.map((r) => r.turn.sets!.floor.length)), 1)} |`);
  lines.push(`| 必要な道具が候補に入っていた | ${recall('offered')} | ${recall('topp')} | ${recall('floor')} |`);
  const fbStat = (name: PipelineName, fn: (res: PipelineResult) => number) => fmt(avg(fb.map((row) => fn(resultFor(row.turn, name)))), 0);
  lines.push(`| 入力トークン 平均 | ${fbStat('jev_all', (r) => r.promptTokens)} | ${fbStat('jev_topp', (r) => r.promptTokens)} | ${fbStat('jev_floor', (r) => r.promptTokens)} |`);
  lines.push(`| 応答時間 平均（実測） | ${fbStat('jev_all', (r) => r.latencyMs)} ms | ${fbStat('jev_topp', (r) => r.latencyMs)} ms | ${fbStat('jev_floor', (r) => r.latencyMs)} ms |`);
  lines.push(
    `| 余計なデータを取った | ${['jev_all', 'jev_topp', 'jev_floor'].map((name) => pct(fb.filter((row) => overFetched(caseById.get(row.case_id)!, resultFor(row.turn, name as PipelineName)).length > 0).length, fb.length)).join(' | ')} |`,
  );
  lines.push(
    `| 必要なデータを取った | ${['jev_all', 'jev_topp', 'jev_floor'].map((name) => pct(fb.filter((row) => requiredOk(caseById.get(row.case_id)!, resultFor(row.turn, name as PipelineName))).length, fb.length)).join(' | ')} |`,
  );
  lines.push('');

  // --- judge -----------------------------------------------------------------
  const judged = rows.filter((row) => Object.keys(row.judge).length > 0);
  lines.push('## 回答品質（補助指標・rep 1 のみ、MAYA の設定を渡した絶対評価）', '');
  lines.push(`| | ${PIPELINES.join(' | ')} |`, `|---|${PIPELINES.map(() => '---').join('|')}|`);
  const jv = (fn: (v: NonNullable<V2Row['judge']['current']>) => number) =>
    PIPELINES.map((name) => judged.map((row) => row.judge[name]).filter(Boolean).map((v) => fn(v!)));
  rowOf('点数 平均（1〜5）', jv((v) => v.score), mean(2));
  rowOf('根拠のない数字なし', jv((v) => (v.grounded ? 1 : 0)), rate);
  rowOf('人格・口調が設定どおり', jv((v) => (v.personaOk ? 1 : 0)), rate);
  rowOf('データの取り方が適切', jv((v) => (v.toolUse === 'appropriate' ? 1 : 0)), rate);
  rowOf('取りすぎ', jv((v) => (v.toolUse === 'excessive' ? 1 : 0)), rate);
  rowOf('取らなさすぎ', jv((v) => (v.toolUse === 'insufficient' ? 1 : 0)), rate);
  const pairs = rows.flatMap((row) =>
    PIPELINES.filter((name) => row.judgeRepeat[name] && row.judge[name]).map((name) => [row.judge[name]!, row.judgeRepeat[name]!] as const),
  );
  lines.push('');
  lines.push(
    `- 採点の安定性（同じ返事を2回採点、${pairs.length} 件）: 点数が一致 ${pct(pairs.filter(([a, b]) => a.score === b.score).length, pairs.length)} / ±1以内 ${pct(pairs.filter(([a, b]) => Math.abs(a.score - b.score) <= 1).length, pairs.length)} / データの取り方の判定が一致 ${pct(pairs.filter(([a, b]) => a.toolUse === b.toolUse).length, pairs.length)}`,
  );
  lines.push('');

  // --- by category ------------------------------------------------------------
  lines.push('## カテゴリ別（全ターン）', '', '| category | ターン | direct 率 | 応答時間 current → jev_topp | 入力トークン current → jev_topp |', '|---|---|---|---|---|');
  const categories = [...new Set(CASES.map((c) => c.category))];
  for (const category of categories) {
    const subset = rows.filter((row) => caseById.get(row.case_id)!.category === category);
    if (subset.length === 0) continue;
    const m = (name: PipelineName, fn: (r: PipelineResult) => number) => fmt(avg(subset.map((row) => fn(resultFor(row.turn, name)))));
    lines.push(
      `| ${category} | ${subset.length} | ${pct(subset.filter((r) => r.turn.direct).length, subset.length)} | ${m('current', (r) => r.latencyMs)} → ${m('jev_topp', (r) => r.latencyMs)} ms | ${m('current', (r) => r.promptTokens)} → ${m('jev_topp', (r) => r.promptTokens)} |`,
    );
  }
  lines.push('');

  const samples = pickSamples(rows);
  writeFileSync(path.join(outDir, 'samples.md'), renderSamples(samples, rows));
  lines.push(`代表ケース ${samples.length} 件は samples.md に、回答本文つきで出している。`, '');
  return lines.join('\n');
}

// --- samples ---------------------------------------------------------------------

interface Sample {
  row: V2Row;
  why: string;
}

export function pickSamples(rows: V2Row[], max = 15): Sample[] {
  const first = rows.filter((row) => row.rep === 1);
  const cases = byCase(rows);
  const picked: Sample[] = [];
  const take = (why: string, filter: (row: V2Row, c: RouterCase) => boolean, count: number) => {
    for (const row of first) {
      if (picked.length >= max || count <= 0) return;
      if (picked.some((s) => s.row.case_id === row.case_id)) continue;
      if (filter(row, caseById.get(row.case_id)!)) {
        picked.push({ row, why });
        count -= 1;
      }
    }
  };
  const cur = (row: V2Row) => row.turn.current;
  take('会話に答えがある。取り直すか', (row, c) => Boolean(c.contextSufficient), 2);
  take('本人向けの質問。useful を先に取った', (row, c) => Boolean(c.useful) && Boolean(row.turn.direct?.fetched.some((f) => f.tool === row.turn.jev?.useful.choice)), 2);
  take('本人向けの質問。Jev は取らず、現行は取った', (row, c) => Boolean(c.useful) && Boolean(row.turn.direct) && row.turn.direct!.fetched.length === 0 && cur(row).fetched.length > 0, 1);
  take('一般的な質問。現行は余計に取った', (row, c) => c.category === 'B_none' && cur(row).fetched.length > 0 && Boolean(row.turn.direct), 2);
  take('Jev が先に取って1往復', (row) => row.turn.direct?.reason === 'required', 1);
  take('fallback。候補集合で取り方が変わった', (row) =>
    Boolean(row.turn.fallback) &&
    fetchedTools(row.turn.fallback!.topp).sort().join() !== fetchedTools(cur(row)).sort().join(), 2);
  take('3回で取り方が揺れた', (row) => {
    const list = cases.get(row.case_id) ?? [];
    return new Set(list.map((r) => fetchedTools(resultFor(r.turn, 'jev_topp')).sort().join('+'))).size > 1;
  }, 2);
  take('Jev が自信を持って外した', (row, c) => {
    const jev = row.turn.jev;
    return Boolean(jev) && jev!.required.confidence >= 0.9 && ![c.expected, ...(c.acceptable ?? [])].includes(jev!.required.choice);
  }, 2);
  take('複数の道具をつないだ', (row) => cur(row).toolsCalled.length >= 3 || (row.turn.fallback?.topp.toolsCalled.length ?? 0) >= 3, 1);
  return picked;
}

function renderSamples(samples: Sample[], rows: V2Row[]): string {
  const lines = ['# 代表ケース（rep 1）', '', 'すべて架空の質問・架空のデータ。同じ返事を共有しているパイプラインはまとめて表示。', ''];
  for (const { row, why } of samples) {
    const c = caseById.get(row.case_id)!;
    const jev = row.turn.jev;
    lines.push(`## ${c.id}：${c.message}`, '', `- 選んだ理由: ${why}`);
    if (c.context?.length) lines.push(`- 直前の会話: ${c.context.map((t) => `${t.role === 'user' ? 'Gakky' : 'MAYA'}「${t.text}」`).join(' → ')}`);
    lines.push(`- 期待: 必要 ${c.expected}${c.useful ? ` / あると良い ${c.useful}` : ''}${c.contextSufficient ? ' / 会話に答えがある' : ''}`);
    if (jev) {
      lines.push(
        `- Jev: context_sufficient ${fmt(jev.contextSufficient * 100)}% / required ${jev.required.choice} ${fmt(jev.required.confidence * 100)}% / useful ${jev.useful.choice} ${fmt(jev.useful.confidence * 100)}% / period ${jev.period} → ${jevPathOf(row)}`,
      );
    }
    const reps = rows.filter((r) => r.case_id === c.id);
    lines.push(`- ${reps.length} 回の取り方: ${PIPELINES.map((name) => `${name} [${reps.map((r) => fetchedTools(resultFor(r.turn, name)).join('+') || '-').join(' / ')}]`).join('、')}`);
    lines.push('');
    const groups = new Map<string, PipelineName[]>();
    for (const name of PIPELINES) {
      const key = row.messages[name] || `(失敗: ${resultFor(row.turn, name).error ?? '形が不正'})`;
      groups.set(key, [...(groups.get(key) ?? []), name]);
    }
    for (const [message, names] of groups) {
      const result = resultFor(row.turn, names[0]!);
      const verdict = row.judge[names[0]!];
      lines.push(
        `### ${names.join(' / ')}`,
        '',
        `道具: ${result.toolsCalled.join(' → ') || 'なし'} ／ 往復 ${result.geminiRounds} ／ ${result.latencyMs} ms ／ 入力 ${result.promptTokens} トークン${verdict ? ` ／ 採点 ${verdict.score}点・${verdict.toolUse}${verdict.grounded ? '' : '・根拠なしの数字あり'}` : ''}`,
        '',
        message
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n'),
        '',
      );
      if (verdict) lines.push(`採点の理由: ${verdict.reason}`, '');
    }
  }
  return lines.join('\n');
}
