/**
 * Blind pairwise judge: which of two MAYA answers serves the president better.
 * The judge sees each answer with the data that pipeline fetched, never which
 * pipeline wrote it, and the order is shuffled per case. It is Gemini judging
 * Gemini, so it is a second opinion, not ground truth; the report keeps the
 * answers so a person can read them.
 */
import type { RouterCase } from './cases.ts';
import type { FetchedData } from './pipelines.ts';

const JUDGE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    winner: { type: 'STRING', enum: ['A', 'B', 'tie'] },
    a_grounded: { type: 'BOOLEAN' },
    b_grounded: { type: 'BOOLEAN' },
    a_answers_question: { type: 'BOOLEAN' },
    b_answers_question: { type: 'BOOLEAN' },
    reason: { type: 'STRING' },
  },
  required: ['winner', 'a_grounded', 'b_grounded', 'a_answers_question', 'b_answers_question', 'reason'],
};

export interface JudgeVerdict {
  /** From the pipelines' side, after undoing the shuffle. */
  winner: 'current' | 'jev' | 'tie';
  currentGrounded: boolean;
  jevGrounded: boolean;
  currentAnswers: boolean;
  jevAnswers: boolean;
  reason: string;
  promptTokens: number;
  outputTokens: number;
}

export interface JudgedAnswer {
  message: string;
  fetched: FetchedData[];
}

function describe(label: string, answer: JudgedAnswer): string {
  const data =
    answer.fetched.length === 0
      ? '（データは取得していない）'
      : answer.fetched.map((item) => `${item.tool} ${JSON.stringify(item.args)} → ${JSON.stringify(item.result)}`).join('\n');
  return `### 回答${label}\n取得したデータ:\n${data}\n\n回答本文:\n${answer.message}`;
}

/** Stable per case, so a rerun shows the judge the same order. */
function currentGoesFirst(caseId: string): boolean {
  let hash = 0;
  for (const char of caseId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 2 === 0;
}

export async function judge(
  apiKey: string,
  model: string,
  testCase: RouterCase,
  current: JudgedAnswer,
  jev: JudgedAnswer,
): Promise<JudgeVerdict> {
  const currentFirst = currentGoesFirst(testCase.id);
  const [a, b] = currentFirst ? [current, jev] : [jev, current];
  const conversation = (testCase.context ?? []).map((turn) => `${turn.role === 'user' ? '社長' : 'MAYA'}: ${turn.text}`).join('\n');
  const prompt = [
    'あなたは、社長の相談相手のAI「MAYA」の回答を採点します。すべて評価用の架空のデータです。',
    '同じ質問への2つの回答を比べ、社長にとってより良い方を選んでください。',
    '基準（重要な順）:',
    '1. 事実: 数字や出来事が、その回答が取得したデータまたは会話の中にあるものだけか。無いものを作っていれば grounded=false。',
    '2. 質問に答えているか: 聞かれた期間・対象に合ったデータで答えているか。的外れなら answers_question=false。',
    '   対象が特定できない質問に、聞き返したり確認したりするのは正しい対応として扱う。',
    '3. 役に立つか: 判断や次の行動に役立つか。',
    '差が小さければ tie にしてください。長さそのものは評価しないでください。',
    '',
    `## 直前の会話\n${conversation || '（なし）'}`,
    `## 社長の質問\n${testCase.message}`,
    describe('A', a),
    describe('B', b),
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: JUDGE_SCHEMA, temperature: 0 },
      }),
    },
  );
  if (!response.ok) throw new Error(`judge ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  const text = body.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text ?? '{}';
  const raw = JSON.parse(text) as {
    winner: 'A' | 'B' | 'tie';
    a_grounded: boolean;
    b_grounded: boolean;
    a_answers_question: boolean;
    b_answers_question: boolean;
    reason: string;
  };
  const pick = (first: 'current' | 'jev', second: 'current' | 'jev') =>
    raw.winner === 'tie' ? 'tie' : raw.winner === 'A' ? first : second;
  return {
    winner: currentFirst ? pick('current', 'jev') : pick('jev', 'current'),
    currentGrounded: currentFirst ? raw.a_grounded : raw.b_grounded,
    jevGrounded: currentFirst ? raw.b_grounded : raw.a_grounded,
    currentAnswers: currentFirst ? raw.a_answers_question : raw.b_answers_question,
    jevAnswers: currentFirst ? raw.b_answers_question : raw.a_answers_question,
    reason: raw.reason,
    promptTokens: body.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}
