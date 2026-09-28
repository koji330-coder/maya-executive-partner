/**
 * @jest-environment node
 *
 * Local E2E for Jev routing: the real chat.ts `answer()`, real Gemini and real
 * Jev, with D1 and the tools replaced by made-up data (fixtures.ts). Each case
 * runs with routing off and with it on, so the two can be read side by side.
 *
 * Not part of `npm test` (it calls paid APIs). Run by hand:
 *   NODE_USE_ENV_PROXY=1 npx jest -c server/scripts/jev-router/jest.e2e.config.cjs
 *   (PICK=A01,B06 to run only some cases)
 * In the cloud environment the keys are attached by the network layer; the
 * placeholders below are replaced on the way out.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ToolCall } from '@/services/llm/geminiClient';

import { answer, type ChatReply } from '../../src/chat';
import type { Env } from '../../src/env';
import { CASES } from './cases';

const mockMode = { value: 'off' as 'off' | 'assist' };

function mockFixture() {
  return (_envOrSource: unknown, call: ToolCall) =>
    Promise.resolve((jest.requireActual('./fixtures') as typeof import('./fixtures')).runFixtureTool(call));
}

jest.mock('../../src/memory/settings', () => ({
  loadCostPolicy: () => Promise.resolve({ preferFree: true, allowPaidFallback: false, paidDailyLimitYen: 1000 }),
  loadJevMode: () => Promise.resolve(mockMode.value),
}));
jest.mock('../../src/memory/apiKeys', () => ({ resolveKeys: () => Promise.resolve({ free: 'placeholder', paid: undefined }) }));
jest.mock('../../src/memory/decisions', () => ({ decisionsForPrompt: () => Promise.resolve([]) }));
jest.mock('../../src/memory/inbox', () => ({ activityForPrompt: () => Promise.resolve({ journals: [], topics: [] }) }));
jest.mock('../../src/usage', () => ({ recordUsage: () => Promise.resolve(), paidLimitReached: () => Promise.resolve(false) }));
jest.mock('../../src/fitlog', () => ({
  ...jest.requireActual('../../src/fitlog'),
  runFitlogDayTool: mockFixture(),
  runFitlogProgressTool: mockFixture(),
  runFitlogWeeklyTool: mockFixture(),
  runFitlogExerciseTool: mockFixture(),
}));
jest.mock('../../src/haksai', () => ({
  ...jest.requireActual('../../src/haksai'),
  runHaksaiInventoryTool: mockFixture(),
  runHaksaiSalesTool: mockFixture(),
  runHaksaiMarketTool: mockFixture(),
}));
jest.mock('../../src/voicebox', () => ({
  ...jest.requireActual('../../src/voicebox'),
  runVoiceTool: mockFixture(),
  vaultSource: () => ({}),
}));
jest.mock('../../src/memory/search', () => ({
  ...jest.requireActual('../../src/memory/search'),
  runMemoryTool: mockFixture(),
}));

const ENV = {
  MAYA_DB: {} as D1Database,
  MODEL: 'gemini-3.8-flash',
  MAX_OUTPUT_TOKENS: '4096',
  PREFER_FREE: 'true',
  ALLOW_PAID_FALLBACK: 'false',
  PAID_DAILY_LIMIT_YEN: '1000',
  TYPESAFE_API_KEY: 'placeholder',
  FITLOG_API_URL: 'https://fitlog.invalid',
  FITLOG_API_KEY: 'x',
  HAKSAI_MCP_URL: 'https://haksai.invalid',
  HAKSAI_MCP_CLIENT_ID: 'x',
  HAKSAI_MCP_CLIENT_SECRET: 'x',
  VOICEBOX_VAULT_URL: 'https://vault.invalid',
  VOICEBOX_VAULT_CLIENT_ID: 'x',
  VOICEBOX_VAULT_CLIENT_SECRET: 'x',
} as unknown as Env;

/** One or two of each route and each kind of question. */
const PICK = (process.env.PICK ?? 'A01,A06,A13,A08,A10,A15,B01,B02,B06,B09,C04,C06,D02,E01,E15,E16,P01,P03,P06,X01').split(',');

interface Row {
  id: string;
  message: string;
  off: ChatReply['route'] | { error: string };
  assist: ChatReply['route'] | { error: string };
  offMessage: string;
  assistMessage: string;
}

async function run(mode: 'off' | 'assist', id: string) {
  mockMode.value = mode;
  const testCase = CASES.find((c) => c.id === id)!;
  try {
    const reply = await answer(ENV, {
      message: testCase.message,
      history: (testCase.context ?? []).map((turn) => ({ role: turn.role, text: turn.text })),
    });
    return { route: reply.route, message: (reply.response as { message: string }).message };
  } catch (error) {
    return { route: { error: error instanceof Error ? error.message : String(error) }, message: '' };
  }
}

jest.setTimeout(900_000);

it('runs the picked cases with routing off and on', async () => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const rows: Row[] = [];
  for (const id of PICK) {
    const off = await run('off', id);
    const assist = await run('assist', id);
    rows.push({ id, message: CASES.find((c) => c.id === id)!.message, off: off.route, assist: assist.route, offMessage: off.message, assistMessage: assist.message });
  }
  const outDir = path.join(__dirname, 'results');
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `assist-e2e-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(rows, null, 2));
  process.stdout.write(`\n${file}\n`);
  expect(rows.every((row) => !('error' in row.off) && !('error' in row.assist))).toBe(true);
});
