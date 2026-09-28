/**
 * How chat.ts wires Jev routing in. Gemini, Jev, D1 and the tools are stubbed:
 * what is checked is what each route hands to Gemini, and that "off" (and any
 * Jev failure) hands it exactly what it got before Jev existed.
 */
import type { GenerateOptions } from '@/services/llm/geminiClient';

import { answer, type ChatRequest } from '../chat';
import type { Env } from '../env';
import { JevError, type JevDecision } from '../jevRouter';

const mockGenerate = jest.fn();
const mockAskJev = jest.fn();
const mockMode = jest.fn();
const mockFitlogDay = jest.fn();

jest.mock('@/services/llm/geminiClient', () => ({
  ...jest.requireActual('@/services/llm/geminiClient'),
  generateMayaResponse: (options: GenerateOptions) => mockGenerate(options),
}));
jest.mock('../jevRouter', () => ({
  ...jest.requireActual('../jevRouter'),
  askJev: (...args: unknown[]) => mockAskJev(...args),
}));
jest.mock('../memory/settings', () => ({
  loadCostPolicy: () => Promise.resolve({ preferFree: true, allowPaidFallback: false, paidDailyLimitYen: 50 }),
  loadJevMode: () => mockMode(),
}));
jest.mock('../memory/apiKeys', () => ({ resolveKeys: () => Promise.resolve({ free: 'free-key', paid: undefined }) }));
jest.mock('../memory/decisions', () => ({ decisionsForPrompt: () => Promise.resolve([]) }));
jest.mock('../memory/inbox', () => ({ activityForPrompt: () => Promise.resolve({ journals: [], topics: [] }) }));
jest.mock('../usage', () => ({ recordUsage: () => Promise.resolve(), paidLimitReached: () => Promise.resolve(false) }));
jest.mock('../fitlog', () => ({
  ...jest.requireActual('../fitlog'),
  runFitlogDayTool: (...args: unknown[]) => mockFitlogDay(...args),
}));

const ENV = {
  MAYA_DB: {} as D1Database,
  MODEL: 'gemini-test',
  PREFER_FREE: 'true',
  ALLOW_PAID_FALLBACK: 'false',
  PAID_DAILY_LIMIT_YEN: '50',
  FITLOG_API_URL: 'https://fitlog.example',
  FITLOG_API_KEY: 'k',
  TYPESAFE_API_KEY: 'jev-key',
} as unknown as Env;

const REPLY = {
  message: 'テストの返事です。',
  emotion: 'neutral',
  pose: 'neutral',
  scene: 'office',
  voice: { shouldPlay: false },
};

function geminiResult(toolCalls: string[] = []) {
  return {
    payload: REPLY,
    promptTokens: 4000,
    responseTokens: 200,
    totalTokens: 4700,
    thoughtsTokens: 500,
    toolCalls: toolCalls.map((name) => ({ name, args: {} })),
    rounds: toolCalls.length > 0 ? 2 : 1,
    finishReason: 'STOP',
  };
}

function jev(partial: Partial<JevDecision>): JevDecision {
  return {
    required: 'none',
    confidence: 0.97,
    requiredProbabilities: { none: 0.97, fitlog_day: 0.03 },
    period: 'not_stated',
    useful: 'none',
    usefulConfidence: 0.4,
    contextSufficient: 0.1,
    latencyMs: 280,
    inputTokens: 3900,
    ...partial,
  };
}

const ask = (message: string, extra: Partial<ChatRequest> = {}) => answer(ENV, { message, history: [], ...extra });
const sent = () => mockGenerate.mock.calls.at(-1)![0] as GenerateOptions;
const names = (options: GenerateOptions) => (options.tools ?? []).map((tool) => tool.name);

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockGenerate.mockReset().mockResolvedValue(geminiResult());
  mockAskJev.mockReset();
  mockMode.mockReset().mockResolvedValue('off');
  mockFitlogDay.mockReset().mockResolvedValue({ 体重: '72.4kg（テスト）' });
});

afterEach(() => jest.restoreAllMocks());

describe('Jev routing in chat.ts', () => {
  it('off: never asks Jev, and hands Gemini what it always did', async () => {
    const reply = await ask('今日の体重は？');
    expect(mockAskJev).not.toHaveBeenCalled();
    const options = sent();
    expect(names(options)).toEqual(['fitlog_day', 'fitlog_progress', 'fitlog_weekly', 'fitlog_exercise']);
    expect(options.requireToolFirst).toBe(true);
    expect(options.systemPrompt).not.toContain('取得済みのデータ');
    expect(reply.route).toMatchObject({ mode: 'off', route: 'legacy', prefetched: [] });
  });

  it('a Jev failure falls back to exactly the off behaviour', async () => {
    await ask('今日の体重は？');
    const off = sent();
    mockMode.mockResolvedValue('assist');
    mockAskJev.mockRejectedValue(new JevError('timeout', 'slow'));
    const reply = await ask('今日の体重は？');
    const fallback = sent();
    expect(names(fallback)).toEqual(names(off));
    expect(fallback.requireToolFirst).toBe(off.requireToolFirst);
    expect(fallback.systemPrompt).toBe(off.systemPrompt);
    expect(reply.route).toMatchObject({ mode: 'assist', route: 'legacy_fallback', jevError: 'timeout' });
  });

  it('an unexpected error inside the Jev step also falls back', async () => {
    mockMode.mockResolvedValue('assist');
    mockAskJev.mockRejectedValue(new Error('boom'));
    const reply = await ask('おはよう');
    expect(reply.route).toMatchObject({ route: 'legacy_fallback', jevError: 'invalid' });
  });

  it('sure of none: one round, no tools offered', async () => {
    mockMode.mockResolvedValue('assist');
    mockAskJev.mockResolvedValue(jev({ required: 'none', confidence: 0.99 }));
    const reply = await ask('粗利率って何？');
    expect(names(sent())).toEqual([]);
    expect(sent().requireToolFirst).toBe(false);
    expect(reply.route).toMatchObject({ route: 'direct_none', jev: { required: 'none', confidence: 0.99 } });
  });

  it('sure of none on a health question: the fixed rule reads FIT LOG first', async () => {
    mockMode.mockResolvedValue('assist');
    mockAskJev.mockResolvedValue(jev({ required: 'none', confidence: 0.99 }));
    const reply = await ask('減量中のタンパク質の目安は？');
    expect(mockFitlogDay).toHaveBeenCalledTimes(1);
    expect(sent().systemPrompt).toContain('道具 fitlog_day');
    expect(sent().systemPrompt).toContain('72.4kg（テスト）');
    expect(reply.route).toMatchObject({ route: 'direct_rule', rule: { id: 'fitness-own-data' }, prefetched: ['fitlog_day'] });
  });

  it('sure of a tool: the server reads it and Gemini answers without tools', async () => {
    mockMode.mockResolvedValue('assist');
    mockAskJev.mockResolvedValue(
      jev({ required: 'fitlog_day', confidence: 0.99, period: 'yesterday', requiredProbabilities: { fitlog_day: 0.99, none: 0.01 } }),
    );
    const reply = await ask('昨日よく眠れてた？');
    expect(mockFitlogDay.mock.calls[0]![1]).toMatchObject({ name: 'fitlog_day', args: { date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } });
    expect(names(sent())).toEqual([]);
    expect(reply.route).toMatchObject({ route: 'direct_prefetch', prefetched: ['fitlog_day'] });
  });

  it('a failed read is told to MAYA, not thrown', async () => {
    mockMode.mockResolvedValue('assist');
    mockAskJev.mockResolvedValue(jev({ required: 'fitlog_day', confidence: 0.99, requiredProbabilities: { fitlog_day: 0.99 } }));
    mockFitlogDay.mockRejectedValue(new Error('FIT LOG に届きませんでした'));
    await ask('今日の体重は？');
    expect(sent().systemPrompt).toContain('FIT LOG に届きませんでした');
  });

  it('unsure: Gemini sees only the likeliest tools', async () => {
    mockMode.mockResolvedValue('assist');
    mockAskJev.mockResolvedValue(
      jev({
        required: 'fitlog_progress',
        confidence: 0.6,
        requiredProbabilities: { fitlog_progress: 0.6, fitlog_day: 0.35, search_memory: 0.03, none: 0.02 },
      }),
    );
    mockGenerate.mockResolvedValue(geminiResult(['fitlog_progress']));
    const reply = await ask('最近ちゃんと絞れてる？');
    expect(names(sent())).toEqual(['fitlog_day', 'fitlog_progress']);
    expect(reply.route).toMatchObject({ route: 'fallback_topp', toolsCalled: ['fitlog_progress'], rounds: 2 });
  });

  it('skips Jev when something is attached', async () => {
    mockMode.mockResolvedValue('assist');
    const reply = await ask('この画面どう？', { attachments: [{ kind: 'image', name: 'a.png', mimeType: 'image/png', data: 'AAAA' }] });
    expect(mockAskJev).not.toHaveBeenCalled();
    expect(reply.route).toMatchObject({ route: 'legacy_fallback', jevError: 'attachments' });
  });

  it('logs numbers and tool names, never the message', async () => {
    mockMode.mockResolvedValue('assist');
    mockAskJev.mockResolvedValue(jev({ required: 'none', confidence: 0.99 }));
    await ask('秘密の相談です');
    const logged = (console.log as jest.Mock).mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('"route":"direct_none"');
    expect(logged).not.toContain('秘密の相談です');
    expect(logged).not.toContain('jev-key');
  });
});
