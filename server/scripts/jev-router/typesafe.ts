/**
 * TypeSafe (Jev) adapter, per the official API reference
 * (https://docs.typesafe.ai/api, read 2026-09-28):
 *
 *   POST https://api.typesafe.ai/v1/systemone
 *   Authorization: Bearer <API_KEY>
 *   { state, model, questions: { <id>: { type: "choice", instructions, criteria: { <option>: <description> } } } }
 *   → { model, answers: { <id>: { type, choice, probabilities, confidence } }, usage: { input_tokens, output_tokens } }
 *
 * Price (https://docs.typesafe.ai/models): jev-1.13 charges input tokens only,
 * $0.042 per million. The version is pinned so the numbers here stay comparable
 * when jev-latest moves.
 *
 * The key: in the cloud environment it is an API credential that the network
 * layer attaches to requests for api.typesafe.ai, so this process never sees it.
 * Run elsewhere, it is read from TYPESAFE_API_KEY. Either way it is never
 * written to the log or the report.
 */
import type { RouterQuestion, RouterState } from './prompts.ts';
import type { Router, RouterDecision } from './routers.ts';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const MODEL = 'jev-1.13.0';
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;
const RETRYABLE = new Set([429, 529]);
const MAX_ATTEMPTS = 4;

interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

interface SystemOneResponse {
  model: string;
  answers: Record<string, ChoiceAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

export function toRequest(state: RouterState, question: RouterQuestion) {
  return {
    state,
    model: MODEL,
    questions: {
      [question.id]: { type: 'choice', instructions: question.instructions, criteria: question.criteria },
    },
  };
}

export function fromResponse(body: SystemOneResponse, questionId: string): RouterDecision {
  const answer = body.answers?.[questionId];
  if (!answer || answer.type !== 'choice') throw new Error('TypeSafe の応答に choice の答えがありません。');
  const inputTokens = body.usage?.input_tokens ?? null;
  return {
    selected: answer.choice,
    probabilities: answer.probabilities,
    confidence: answer.confidence,
    inputTokens,
    costUsd: inputTokens === null ? null : inputTokens * USD_PER_INPUT_TOKEN,
    model: body.model,
    raw: body,
  };
}

export function typesafeRouter(): Router {
  const apiKey = process.env.TYPESAFE_API_KEY;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return {
    name: 'typesafe-jev',
    remote: true,
    async decide(state, question) {
      const body = JSON.stringify(toRequest(state, question));
      for (let attempt = 1; ; attempt += 1) {
        const response = await fetch(ENDPOINT, { method: 'POST', headers, body });
        if (response.ok) return fromResponse((await response.json()) as SystemOneResponse, question.id);
        if (!RETRYABLE.has(response.status) || attempt >= MAX_ATTEMPTS) {
          // The error body describes the offending field; it never echoes the key.
          throw new Error(`TypeSafe ${response.status}: ${(await response.text()).slice(0, 300)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
      }
    },
  };
}
