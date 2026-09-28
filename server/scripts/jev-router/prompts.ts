/**
 * The two router variants the eval compares. Both offer the same options, each
 * described by the production tool description (a Choice's `criteria`); they
 * differ only in how much of MAYA's tool rule is spelled out.
 *
 * A (minimal): tool names and descriptions, and "pick the next tool".
 * B (explicit): MAYA's role in the state, and the rules that fixed the
 * Playground misroute (none 92% → fitlog 100%) written into the instructions.
 *
 * Comparing them separates "Jev routes well" from "a detailed rule routes well".
 */
import type { RouterCase } from './cases.ts';
import { EVAL_TOOLS, NONE } from './tools.ts';

export type Variant = 'minimal' | 'explicit';
export const VARIANTS: Variant[] = ['minimal', 'explicit'];

export interface RouterState {
  maya_role?: string;
  conversation_context: { role: string; text: string }[];
  known_facts: Record<string, string>;
  user_message: string;
}

export interface RouterQuestion {
  id: 'next_tool';
  instructions: string | { question: string; routing_rules: string[] };
  /** Option → description. The option names are the tool names plus none. */
  criteria: Record<string, string>;
}

const MAYA_ROLE =
  'MAYA は、一人で会社を経営する社長の相談相手（AIの経営パートナー）。' +
  'Amazon の販売データ（HAKSAI）、体の記録（FIT LOG）、会議と音声メモ（VoiceBox）、過去の決定や記録（Journal）を、' +
  'Tool で読み取って相談に答える。Tool はすべて読み取り専用。';

const RULES = [
  'ユーザー固有の実データ（売上、在庫、体重、食事、会議の中身、過去に決めたこと等）が必要で、そのデータが state 内に無い場合は、推測せず対応する Tool を選ぶ。',
  'state 内に無い事実を推測して答えない。',
  `${NONE} は、外部データや保存データを取得しなくても、一般知識・意見・推論、または state 内に既にある情報だけで正確に回答できる場合に限る。`,
  '複数段階の処理が必要な場合は、最終的な Tool ではなく「次に実行すべき Tool」を選ぶ（例: 商品名が分からず在庫を聞かれたら、先に記録から商品を特定する）。',
  '何を指しているか state から特定できない短い発話は、Tool を当て推量で選ばず none（聞き返す）とする。',
];

const MINIMAL_INSTRUCTIONS = `\`user_message\` に回答するために、次に使用すべき Tool を1つ選んでください。Tool が不要なら ${NONE} を選んでください。`;
const MINIMAL_NONE = 'Tool を使わない。';

const EXPLICIT_INSTRUCTIONS =
  'ユーザーへ正確に回答するために、現在の state から次に使用すべき Tool を1つ選んでください。' +
  'ユーザー固有の実データが必要で、そのデータが state 内に無い場合は必ず対応する Tool を選んでください。' +
  '複数段階の処理が必要な場合、最終的な Tool ではなく「次に実行すべき Tool」を選んでください。' +
  `${NONE} は Tool を一切使わず正確に回答できる場合のみ選んでください。` +
  '判断は `routing_rules` に従ってください。';
const EXPLICIT_NONE =
  'Tool を使わない。外部データや保存データを取得しなくても、一般知識・意見・推論、または state 内に既にある情報だけで正確に回答できる場合、' +
  'または発話が何を指すか state から特定できず聞き返すべき場合に限る。';
export function buildState(variant: Variant, testCase: RouterCase): RouterState {
  const common = {
    conversation_context: testCase.context ?? [],
    known_facts: testCase.known ?? {},
    user_message: testCase.message,
  };
  if (variant === 'minimal') return common;
  return { maya_role: MAYA_ROLE, ...common };
}

export function buildQuestion(variant: Variant): RouterQuestion {
  const criteria = Object.fromEntries(EVAL_TOOLS.map((tool) => [tool.name, tool.description]));
  if (variant === 'minimal') {
    return { id: 'next_tool', instructions: MINIMAL_INSTRUCTIONS, criteria: { ...criteria, [NONE]: MINIMAL_NONE } };
  }
  return {
    id: 'next_tool',
    instructions: { question: EXPLICIT_INSTRUCTIONS, routing_rules: RULES },
    criteria: { ...criteria, [NONE]: EXPLICIT_NONE },
  };
}
