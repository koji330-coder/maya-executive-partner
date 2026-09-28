/**
 * Absolute judge for E2E v2: one answer at a time, scored against MAYA's own
 * system prompt (persona and tool rules), at temperature 0. Scoring answers one
 * by one instead of in pairs lets four pipelines share one scale, and giving
 * the judge the persona stops it from reading "Gakky" as a made-up name.
 */
import type { RouterCase } from './cases.ts';
import type { FetchedData } from './pipelines.ts';

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    score: { type: 'INTEGER', minimum: 1, maximum: 5 },
    grounded: { type: 'BOOLEAN' },
    persona_ok: { type: 'BOOLEAN' },
    tool_use: { type: 'STRING', enum: ['appropriate', 'excessive', 'insufficient'] },
    reason: { type: 'STRING' },
  },
  required: ['score', 'grounded', 'persona_ok', 'tool_use', 'reason'],
};

export interface AbsoluteVerdict {
  score: number;
  grounded: boolean;
  personaOk: boolean;
  toolUse: 'appropriate' | 'excessive' | 'insufficient';
  reason: string;
  promptTokens: number;
  outputTokens: number;
}

export async function judgeAbsolute(
  apiKey: string,
  model: string,
  mayaSystemPrompt: string,
  testCase: RouterCase,
  message: string,
  fetched: FetchedData[],
): Promise<AbsoluteVerdict> {
  const conversation = (testCase.context ?? [])
    .map((turn) => `${turn.role === 'user' ? 'Gakky' : 'MAYA'}: ${turn.text}`)
    .join('\n');
  const data =
    fetched.length === 0
      ? '（データは取得していない）'
      : fetched.map((item) => `${item.tool} ${JSON.stringify(item.args)} → ${JSON.stringify(item.result)}`).join('\n');
  const prompt = [
    'あなたは、AI の相棒「MAYA」の返事を採点します。すべて評価用の架空のデータです。',
    '下の「MAYA の設定」が、MAYA の人格と道具（データ取得）の使い方の決まりです。これを基準に採点してください。',
    '相手（社長）は「Gakky」と呼ばれています。返事で Gakky と呼ぶのは正しく、捏造ではありません。',
    '',
    '採点の観点:',
    '- grounded: 数字や出来事が、取得したデータか会話の中にあるものだけなら true。無いものを作っていれば false。一般知識（定義や目安）は捏造ではない。',
    '- persona_ok: MAYA の設定の人格・距離感・口調の幅に収まっていれば true。',
    '- tool_use: 取得したデータが質問に対して適切か。',
    '  - appropriate: 必要なデータを取っている。または、取らずに答えられる質問で取っていない。本人のデータで返事が明らかに良くなる場合に取るのも appropriate。',
    '  - excessive: 質問に関係の薄いデータを取っている。会話の中にすでにある数字を取り直している。',
    '  - insufficient: 本人の実データが必要なのに取らず、推測や一般論だけで答えている。',
    '- score: 1〜5。質問への答えとしての総合点。長さそのものは評価しない。',
    '',
    '## MAYA の設定',
    mayaSystemPrompt,
    '',
    `## 直前の会話\n${conversation || '（なし）'}`,
    `## Gakky の質問\n${testCase.message}`,
    `## MAYA が取得したデータ\n${data}`,
    `## MAYA の返事\n${message}`,
  ].join('\n');

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
    }),
  });
  if (!response.ok) throw new Error(`judge ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  const text = body.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text ?? '{}';
  const raw = JSON.parse(text) as { score: number; grounded: boolean; persona_ok: boolean; tool_use: AbsoluteVerdict['toolUse']; reason: string };
  return {
    score: raw.score,
    grounded: raw.grounded,
    personaOk: raw.persona_ok,
    toolUse: raw.tool_use,
    reason: raw.reason,
    promptTokens: body.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}
