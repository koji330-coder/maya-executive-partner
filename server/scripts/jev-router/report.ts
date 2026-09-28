/**
 * Writes the run as the Markdown report the president asked for. The numbers
 * are whatever summarize() measured; nothing is filled in by hand.
 */
import type { BaselineSelection } from './baseline.ts';
import type { RouterCase } from './cases.ts';
import type { Summary } from './metrics.ts';
import type { Router } from './routers.ts';
import { NONE, OPTIONS } from './tools.ts';

function pct(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function ms(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} ms`;
}

function rateCell(rate: { correct: number; total: number; rate: number | null }): string {
  return `${pct(rate.rate)} (${rate.correct}/${rate.total})`;
}

function variantSection(name: string, summary: Summary): string {
  const lines: string[] = [];
  lines.push(`## ${name}`, '');
  lines.push(`- ケース数: ${summary.total}（エラー ${summary.errors}）`);
  lines.push(`- Top-1 accuracy（厳密）: ${rateCell(summary.top1)}`);
  lines.push(`- Top-1 accuracy（許容解を含む）: ${rateCell(summary.top1Lenient)}`);
  lines.push(`- Top-1 accuracy（曖昧ケースを除く）: ${rateCell(summary.top1Unambiguous)}`);
  lines.push(`- none の誤判定率: ${rateCell(summary.noneMisjudged)}`);
  lines.push(`- Tool が必要なのに none: ${rateCell(summary.toolNeededButNone)}`);
  lines.push(`- Tool 不要なのに Tool: ${rateCell(summary.noneNeededButTool)}`);
  lines.push(`- Confidence 90% 以上の誤答: **${summary.highConfidenceWrong.length} 件**`);
  lines.push(`- 曖昧ケースに Confidence 90% 以上で答えた: ${summary.highConfidenceOnAmbiguous.length} 件`);
  lines.push(
    `- Latency: average ${ms(summary.latency.average)} / p50 ${ms(summary.latency.p50)} / p95 ${ms(summary.latency.p95)}`,
  );
  lines.push(
    `- 入力トークン合計: ${summary.inputTokens ?? '取得できず'} / 推定コスト: ${summary.costUsd === null ? '取得できず' : `$${summary.costUsd.toFixed(4)}`}`,
  );
  lines.push('');

  if (summary.highConfidenceWrong.length > 0) {
    lines.push('### 高 confidence 誤答', '', '| case | 発話 | expected | actual | confidence |', '|---|---|---|---|---|');
    for (const row of summary.highConfidenceWrong) {
      lines.push(
        `| ${row.case_id} | ${row.user_message}${row.context.length ? '（文脈あり）' : ''} | ${row.expected_tool} | ${row.jev_selected_tool} | ${pct(row.confidence ?? row.confidence_derived)} |`,
      );
    }
    lines.push('');
  }

  lines.push('### Tool 別', '', '| expected | 正解率 |', '|---|---|');
  for (const tool of OPTIONS) {
    const rate = summary.perTool[tool];
    if (rate) lines.push(`| ${tool} | ${rateCell(rate)} |`);
  }
  lines.push('');

  lines.push('### カテゴリ別', '', '| category | 正解率 |', '|---|---|');
  for (const [category, rate] of Object.entries(summary.perCategory)) lines.push(`| ${category} | ${rateCell(rate)} |`);
  lines.push('');

  lines.push('### Confidence 帯別', '', '| 帯 | 正解率 |', '|---|---|');
  for (const band of summary.bands) lines.push(`| ${band.label} | ${rateCell(band.rate)} |`);
  lines.push('');

  const selectedColumns = OPTIONS.filter((option) =>
    Object.values(summary.confusion).some((line) => (line[option] ?? 0) > 0),
  );
  lines.push('### Confusion matrix（行 = expected、列 = selected）', '');
  lines.push(`| expected \\ selected | ${selectedColumns.join(' | ')} |`);
  lines.push(`|---|${selectedColumns.map(() => '---').join('|')}|`);
  for (const tool of OPTIONS) {
    const line = summary.confusion[tool];
    if (!line) continue;
    lines.push(`| ${tool} | ${selectedColumns.map((column) => line[column] ?? '').join(' | ')} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function baselineSection(baseline: { testCase: RouterCase; selection: BaselineSelection }[]): string {
  const expectsTool = baseline.filter(({ testCase }) => testCase.expected !== NONE);
  const expectsNone = baseline.filter(({ testCase }) => testCase.expected === NONE);
  const kept = expectsTool.filter(({ testCase, selection }) => selection.offered.includes(testCase.expected));
  const narrowedAway = expectsTool.filter(({ testCase, selection }) => !selection.offered.includes(testCase.expected));
  const forcedOnNone = expectsNone.filter(({ selection }) => selection.forceTool);
  const notForced = expectsTool.filter(({ selection }) => !selection.forceTool);
  const lines = [
    '## 参考: 現行 MAYA の第1段（正規表現による絞り込み）',
    '',
    '現行は「正規表現で Gemini に見せる Tool を絞る → Gemini が選ぶ」の2段。オフラインで測れるのは第1段だけなので、Top-1 とは直接比べられない。',
    '',
    `- expected の Tool が候補に残った: ${kept.length}/${expectsTool.length}`,
    `- expected の Tool が絞り込みで消えた: ${narrowedAway.map(({ testCase }) => testCase.id).join(', ') || 'なし'}`,
    `- none が正解なのに Tool 呼び出しを強制: ${forcedOnNone.map(({ testCase }) => testCase.id).join(', ') || 'なし'}`,
    `- Tool が要るのに強制されない（Gemini 任せ）: ${notForced.length}/${expectsTool.length}`,
    '',
  ];
  return lines.join('\n');
}

export function renderReport(
  router: Router,
  summaries: Record<string, Summary>,
  baseline: { testCase: RouterCase; selection: BaselineSelection }[],
): string {
  const header = [
    '# Jev Router Evaluation',
    '',
    `- router: ${router.name}${router.remote ? '' : '（オフライン。Jev の評価ではなく、ハーネスの動作確認）'}`,
    `- 実行: ${new Date().toISOString()}`,
    '- confidence は router が返した値。返さない場合のみ、確率分布から TypeSafe の定義式で算出した値を使う。',
    '',
  ];
  const sections = Object.entries(summaries).map(([variant, summary]) => variantSection(variant, summary));
  return [...header, ...sections, baselineSection(baseline)].join('\n');
}
