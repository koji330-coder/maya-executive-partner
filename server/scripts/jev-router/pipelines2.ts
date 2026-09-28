/**
 * E2E v2: Jev asks three things in one call, and a turn Jev is unsure of goes
 * to Gemini with a candidate set built from Jev's probabilities.
 *
 * One Jev call returns
 *   - context_sufficient (Noul): the conversation already holds the facts
 *   - required_tool (Choice): the data the answer cannot do without, or none
 *   - useful_tool (Choice): data that is not required but makes the answer the
 *     president's own, or none
 *   - period (Choice): which day or month is meant; code does the date maths
 *
 * Direct (1 Gemini round, no tools offered) when Jev is sure (≥ threshold):
 *   context_sufficient → fetch nothing; required none → fetch nothing;
 *   required tool with arguments code can fill → fetch it. In the last two, a
 *   useful tool Jev is also sure of (and whose arguments code can fill) is
 *   fetched alongside. Only then — never on a hunch.
 *
 * Otherwise, fallback. Three candidate sets are compared on the same turn:
 *   all   — what chat.ts offers today (this is the current pipeline itself, so
 *           its result is reused rather than run again)
 *   topp  — the most probable tools until they hold 90% of the tool mass
 *   floor — every tool with probability ≥ 5%
 * The regex's forced first call is kept as in chat.ts, so the only thing that
 * differs between the three is which tools Gemini can see.
 */
import type { RouterCase } from './cases.ts';
import { currentMayaSelection } from './baseline.ts';
import { runFixtureTool } from './fixtures.ts';
import {
  absorb,
  argumentsFor,
  callGemini,
  emptyResult,
  evalSystemPrompt,
  PERIOD_CRITERIA,
  runCurrent,
  type FetchedData,
  type GeminiAuth,
  type PipelineResult,
} from './pipelines.ts';
import { buildState } from './prompts.ts';
import { EVAL_TOOLS, NONE, TOOL_DECLARATIONS } from './tools.ts';
import { postSystemOne, USD_PER_INPUT_TOKEN } from './typesafe.ts';

export const TOPP_MASS = 0.9;
export const FLOOR_PROBABILITY = 0.05;

export interface JevV2Decision {
  contextSufficient: number;
  required: { choice: string; confidence: number; probabilities: Record<string, number> };
  useful: { choice: string; confidence: number; probabilities: Record<string, number> };
  period: string;
  inputTokens: number;
  latencyMs: number;
}

export type DirectReason = 'context' | 'none' | 'required';

export interface V2Turn {
  current: PipelineResult;
  jev: JevV2Decision | null;
  jevError: string | null;
  direct: (PipelineResult & { reason: DirectReason }) | null;
  fallback: { all: PipelineResult; topp: PipelineResult; floor: PipelineResult } | null;
  sets: { topp: string[]; floor: string[]; offered: string[] } | null;
}

function toolCriteria(noneMeaning: string): Record<string, string> {
  return { ...Object.fromEntries(EVAL_TOOLS.map((tool) => [tool.name, tool.description])), [NONE]: noneMeaning };
}

export async function askJevV2(testCase: RouterCase): Promise<JevV2Decision> {
  const started = performance.now();
  const body = await postSystemOne({
    state: buildState('minimal', testCase),
    model: 'jev-1.13.0',
    questions: {
      context_sufficient: {
        type: 'noul',
        instructions:
          '`conversation_context` と `known_facts` に、`user_message` に正確に答えるために必要な事実（数字や内容）が、すでにそろっていますか。',
        criteria: {
          true: '答えの根拠になる事実が会話の中にある。新しくデータを取らなくても答えられる。',
          false: '必要な事実が会話の中に無い。会話が無い場合もこちら。',
        },
      },
      required_tool: {
        type: 'choice',
        instructions:
          '`user_message` に正確に答えるために、必ず取得しなければならないデータの Tool を1つ選んでください。一般知識や意見で答えられる場合、または必要な事実が会話の中にある場合は none を選んでください。',
        criteria: toolCriteria('データを取得しなくても正確に答えられる。'),
      },
      useful_tool: {
        type: 'choice',
        instructions:
          '答えるのに必須ではないが、取得するとユーザー本人の状況に合わせた、明らかに良い回答になる Tool を1つ選んでください。当てはまらなければ none を選んでください。',
        criteria: toolCriteria('本人のデータを足しても、回答は良くならない。'),
      },
      period: {
        type: 'choice',
        instructions: '`user_message` が指している期間・日付はどれですか。直前の会話から引き継がれている場合はそれも含めます。',
        criteria: PERIOD_CRITERIA,
      },
    },
  });
  const answers = body.answers as unknown as Record<string, Record<string, unknown>>;
  const choice = (id: string) => {
    const answer = answers[id];
    if (!answer || answer.type !== 'choice') throw new Error(`Jev の応答に ${id} がありません。`);
    return {
      choice: answer.choice as string,
      confidence: answer.confidence as number,
      probabilities: answer.probabilities as Record<string, number>,
    };
  };
  const noul = answers.context_sufficient;
  if (!noul || noul.type !== 'noul') throw new Error('Jev の応答に context_sufficient がありません。');
  return {
    contextSufficient: noul.noul as number,
    required: choice('required_tool'),
    useful: choice('useful_tool'),
    period: choice('period').choice,
    inputTokens: body.usage.input_tokens,
    latencyMs: Math.round(performance.now() - started),
  };
}

/** Tools (never none) by descending probability until they hold `mass` of the tool probability. */
export function toppSet(probabilities: Record<string, number>, mass = TOPP_MASS): string[] {
  const tools = Object.entries(probabilities)
    .filter(([name]) => name !== NONE)
    .sort((a, b) => b[1] - a[1]);
  const total = tools.reduce((sum, [, p]) => sum + p, 0);
  if (total === 0) return tools.slice(0, 1).map(([name]) => name);
  const picked: string[] = [];
  let held = 0;
  for (const [name, p] of tools) {
    picked.push(name);
    held += p / total;
    if (held >= mass) break;
  }
  return picked;
}

/** Every tool at or above `floor`; the single most likely tool when none is. */
export function floorSet(probabilities: Record<string, number>, floor = FLOOR_PROBABILITY): string[] {
  const tools = Object.entries(probabilities)
    .filter(([name]) => name !== NONE)
    .sort((a, b) => b[1] - a[1]);
  const picked = tools.filter(([, p]) => p >= floor).map(([name]) => name);
  return picked.length > 0 ? picked : tools.slice(0, 1).map(([name]) => name);
}

function withPrefetchedAll(systemPrompt: string, data: FetchedData[]): string {
  if (data.length === 0) return systemPrompt;
  const blocks = data.map(
    (item) =>
      `道具 ${item.tool}（引数 ${JSON.stringify(item.args)}）の結果:\n\`\`\`json\n${JSON.stringify(item.result, null, 2)}\n\`\`\``,
  );
  return `${systemPrompt}\n\n## この質問のために取得済みのデータ\nサーバーが先に取得した結果です。答えの根拠に使ってください。\n\n${blocks.join('\n\n')}`;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((name) => b.includes(name));

async function runWithTools(
  auth: GeminiAuth,
  testCase: RouterCase,
  offered: string[],
  forceTool: boolean,
  path: PipelineResult['path'],
): Promise<PipelineResult> {
  const out = emptyResult(path);
  const started = performance.now();
  try {
    const tools = TOOL_DECLARATIONS.filter((tool) => offered.includes(tool.name));
    absorb(out, await callGemini(auth, testCase, evalSystemPrompt(), tools, forceTool, out.fetched));
  } catch (error) {
    out.error = error instanceof Error ? error.message : String(error);
  }
  out.latencyMs = Math.round(performance.now() - started);
  return out;
}

function addJev(result: PipelineResult, jev: JevV2Decision, path: PipelineResult['path']): PipelineResult {
  return {
    ...result,
    path,
    jevLatencyMs: jev.latencyMs,
    jevChoice: jev.required.choice,
    jevConfidence: jev.required.confidence,
    jevPeriod: jev.period,
    jevInputTokens: jev.inputTokens,
    latencyMs: result.latencyMs + jev.latencyMs,
    costUsd: result.costUsd + jev.inputTokens * USD_PER_INPUT_TOKEN,
    // Copies, so one pipeline's record never aliases another's.
    fetched: [...result.fetched],
    toolsCalled: [...result.toolsCalled],
  };
}

export async function runTurnV2(auth: GeminiAuth, testCase: RouterCase, threshold: number, jevFirst: boolean): Promise<V2Turn> {
  // Jev and the current pipeline are independent; alternate which starts, so
  // Gemini's own prompt caching does not always favour one side.
  let current: PipelineResult | null = null;
  if (!jevFirst) current = await runCurrent(auth, testCase);
  let jev: JevV2Decision | null = null;
  let jevError: string | null = null;
  try {
    jev = await askJevV2(testCase);
  } catch (error) {
    jevError = error instanceof Error ? error.message : String(error);
  }
  if (jevFirst) current = await runCurrent(auth, testCase);
  const turn: V2Turn = { current: current!, jev, jevError, direct: null, fallback: null, sets: null };
  if (!jev) return turn;

  const sure = (confidence: number) => confidence >= threshold;
  let reason: DirectReason | null = null;
  const prefetch: { tool: string; args: Record<string, unknown> }[] = [];
  if (jev.contextSufficient >= threshold) {
    reason = 'context';
  } else if (sure(jev.required.confidence)) {
    if (jev.required.choice === NONE) {
      reason = 'none';
    } else {
      const args = argumentsFor(jev.required.choice, jev.period, testCase);
      if (args) {
        reason = 'required';
        prefetch.push({ tool: jev.required.choice, args });
      }
    }
    if (reason && sure(jev.useful.confidence) && jev.useful.choice !== NONE && jev.useful.choice !== jev.required.choice) {
      const args = argumentsFor(jev.useful.choice, jev.period, testCase);
      if (args) prefetch.push({ tool: jev.useful.choice, args });
    }
  }

  if (reason) {
    const out = emptyResult('jev_direct');
    const started = performance.now();
    try {
      const at = performance.now();
      for (const item of prefetch) {
        out.fetched.push({ ...item, result: runFixtureTool({ name: item.tool, args: item.args }), at, prefetched: true });
        out.toolsCalled.push(item.tool);
      }
      absorb(out, await callGemini(auth, testCase, withPrefetchedAll(evalSystemPrompt(), out.fetched), [], false, out.fetched));
    } catch (error) {
      out.error = error instanceof Error ? error.message : String(error);
    }
    out.latencyMs = Math.round(performance.now() - started);
    turn.direct = { ...addJev(out, jev, 'jev_direct'), reason };
    return turn;
  }

  const selection = currentMayaSelection(testCase);
  const topp = toppSet(jev.required.probabilities);
  const floor = floorSet(jev.required.probabilities);
  turn.sets = { topp, floor, offered: selection.offered };
  const run = async (set: string[], path: PipelineResult['path']) =>
    sameSet(set, selection.offered) ? { ...turn.current, fetched: [...turn.current.fetched] } : runWithTools(auth, testCase, set, selection.forceTool, path);
  const toppResult = await run(topp, 'jev_fallback_topp');
  const floorResult = sameSet(floor, topp) ? toppResult : await run(floor, 'jev_fallback_floor');
  turn.fallback = {
    all: addJev(turn.current, jev, 'jev_fallback_all'),
    topp: addJev(toppResult, jev, 'jev_fallback_topp'),
    floor: addJev(floorResult, jev, 'jev_fallback_floor'),
  };
  return turn;
}
