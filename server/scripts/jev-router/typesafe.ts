/**
 * TypeSafe (Jev) adapter — NOT YET WIRED.
 *
 * The request and response field names must come from TypeSafe's official
 * documentation, not from guesses. docs.typesafe.ai and the API host were
 * blocked by this container's network policy when the harness was written, so
 * the mapping below is left empty on purpose and `decide` refuses to run.
 *
 * To finish it (after reading the docs):
 *   1. set ENDPOINT and the auth header as documented
 *   2. fill `toRequest` from our state + question (Choice question, options = OPTIONS)
 *   3. fill `fromResponse`: the chosen option, per-option probabilities, the
 *      confidence, and token / cost fields if the response carries them
 *
 * The key is read from TYPESAFE_API_KEY in the environment only. It is never
 * written to the log or the report.
 */
import type { RouterQuestion, RouterState } from './prompts.ts';
import type { Router, RouterDecision } from './routers.ts';

const UNVERIFIED =
  'TypeSafe の API 仕様が未確認のため、送信しません（server/scripts/jev-router/typesafe.ts の説明を参照）。';

// Filled in from the official docs. Left null until then.
const ENDPOINT: string | null = null;
const authHeaders: ((apiKey: string) => Record<string, string>) | null = null;

function toRequest(_state: RouterState, _question: RouterQuestion): unknown {
  throw new Error(UNVERIFIED);
}

function fromResponse(_body: unknown): RouterDecision {
  throw new Error(UNVERIFIED);
}

export function typesafeRouter(): Router {
  const endpoint = ENDPOINT;
  const headers = authHeaders;
  if (!endpoint || !headers) throw new Error(UNVERIFIED);
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    throw new Error('TYPESAFE_API_KEY が環境変数にありません。キーはコミットせず、実行時の環境変数だけで渡してください。');
  }
  return {
    name: 'typesafe-jev',
    remote: true,
    async decide(state, question) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers(apiKey) },
        body: JSON.stringify(toRequest(state, question)),
      });
      if (!response.ok) throw new Error(`TypeSafe ${response.status}`);
      return fromResponse(await response.json());
    },
  };
}
