import {
  argumentsFor,
  askJev,
  JEV_TIMEOUT_MS,
  jevRequest,
  JevError,
  planRoute,
  readJevResponse,
  toppSet,
  type JevDecision,
} from '../jevRouter';
import { JEV_RULES, matchRule } from '../jevRules';

const TOOLS = ['search_memory', 'haksai_sales', 'fitlog_day', 'fitlog_progress', 'fitlog_exercise', 'voice_search'];

function decision(partial: Partial<JevDecision>): JevDecision {
  return {
    required: 'none',
    confidence: 0.95,
    requiredProbabilities: { none: 0.95, fitlog_day: 0.05 },
    period: 'not_stated',
    useful: 'none',
    usefulConfidence: 0.5,
    contextSufficient: 0.1,
    latencyMs: 300,
    inputTokens: 3900,
    ...partial,
  };
}

function jevBody(overrides: Record<string, unknown> = {}) {
  return {
    model: 'jev-1.13.0',
    answers: {
      required_tool: { type: 'choice', choice: 'fitlog_day', confidence: 0.97, probabilities: { fitlog_day: 0.98, none: 0.02 } },
      period: { type: 'choice', choice: 'today', confidence: 0.9, probabilities: { today: 0.93 } },
      useful_tool: { type: 'choice', choice: 'none', confidence: 0.4, probabilities: { none: 0.55 } },
      context_sufficient: { type: 'noul', noul: 0.08 },
      ...overrides,
    },
    usage: { input_tokens: 3812, output_tokens: 40 },
  };
}

const plan = (d: Partial<JevDecision>, message = '売上どう？', legacyForce = false) =>
  planRoute({ decision: decision(d), message, today: '2026-09-28', available: TOOLS, legacyForce });

describe('planRoute', () => {
  it('answers without tools when Jev is sure nothing is needed', () => {
    expect(plan({ required: 'none', confidence: 0.95 }, '粗利率って何？')).toEqual({
      route: 'direct_none',
      offered: [],
      requireToolFirst: false,
      prefetch: [],
    });
  });

  it('applies the fixed rule to a health question Jev thought needs no data', () => {
    const result = plan({ required: 'none', confidence: 0.99, period: 'not_stated' }, '減量中のタンパク質は体重1kgあたりどれくらい？');
    expect(result.route).toBe('direct_rule');
    expect(result.prefetch).toEqual([{ tool: 'fitlog_day', args: {} }]);
    expect(result.rule?.id).toBe('fitness-own-data');
  });

  it('reads the tool first when Jev is sure and code can fill its arguments', () => {
    expect(plan({ required: 'haksai_sales', confidence: 0.99, period: 'last_month' })).toMatchObject({
      route: 'direct_prefetch',
      offered: [],
      prefetch: [{ tool: 'haksai_sales', args: { month: '2026-08' } }],
    });
  });

  it('falls back when the sure tool needs a name only the model can write', () => {
    const result = plan({
      required: 'fitlog_exercise',
      confidence: 0.99,
      requiredProbabilities: { fitlog_exercise: 0.99, none: 0.01 },
    });
    expect(result.route).toBe('fallback_topp');
    expect(result.offered).toEqual(['fitlog_exercise']);
  });

  it('offers the likeliest tools and keeps the regex force when Jev is unsure', () => {
    const result = plan(
      {
        required: 'search_memory',
        confidence: 0.5,
        requiredProbabilities: { search_memory: 0.5, voice_search: 0.35, fitlog_day: 0.1, none: 0.05 },
      },
      '前に決めたっけ？',
      true,
    );
    expect(result).toEqual({ route: 'fallback_topp', offered: ['search_memory', 'voice_search', 'fitlog_day'], requireToolFirst: true, prefetch: [] });
  });

  it('never acts on a tool this server does not have', () => {
    const result = planRoute({
      decision: decision({ required: 'voice_recent', confidence: 0.99, requiredProbabilities: { voice_recent: 0.99, fitlog_day: 0.01 } }),
      message: '最近の会議は？',
      today: '2026-09-28',
      available: ['fitlog_day'],
      legacyForce: false,
    });
    expect(result).toMatchObject({ route: 'fallback_topp', offered: ['fitlog_day'] });
  });
});

describe('argumentsFor', () => {
  it('turns periods into dates in code', () => {
    expect(argumentsFor('fitlog_day', 'yesterday', '2026-10-01')).toEqual({ date: '2026-09-30' });
    expect(argumentsFor('haksai_sales', 'last_month', '2026-01-15')).toEqual({ month: '2025-12' });
    expect(argumentsFor('fitlog_day', 'other', '2026-09-28')).toBeNull();
    expect(argumentsFor('haksai_inventory', 'today', '2026-09-28')).toBeNull();
  });
});

describe('toppSet', () => {
  it('ignores none and keeps adding until 90% of the tool mass', () => {
    expect(toppSet({ none: 0.5, fitlog_day: 0.3, fitlog_progress: 0.15, voice_search: 0.05 }, TOOLS)).toEqual(['fitlog_day', 'fitlog_progress']);
  });
});

describe('readJevResponse', () => {
  it('reads the four answers and the token count', () => {
    expect(readJevResponse(jevBody(), 312)).toMatchObject({
      required: 'fitlog_day',
      confidence: 0.97,
      period: 'today',
      useful: 'none',
      contextSufficient: 0.08,
      latencyMs: 312,
      inputTokens: 3812,
    });
  });

  it('rejects an answer that is missing or malformed', () => {
    expect(() => readJevResponse(jevBody({ period: undefined }), 1)).toThrow(JevError);
    expect(() => readJevResponse(jevBody({ context_sufficient: { type: 'noul' } }), 1)).toThrow(JevError);
    expect(() => readJevResponse({ nothing: true }, 1)).toThrow(JevError);
  });
});

describe('askJev', () => {
  const ok = () => Promise.resolve(new Response(JSON.stringify(jevBody()), { status: 200 }));

  it('sends the key as a bearer token, never in the body', async () => {
    const fetchImpl = jest.fn(ok);
    await askJev('secret-key', '今日の体重は？', [], [], fetchImpl as unknown as typeof fetch);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-key');
    expect(String(init.body)).not.toContain('secret-key');
  });

  it('names each way it can fail, so the turn falls back', async () => {
    const kind = async (promise: Promise<unknown>) => {
      try {
        await promise;
        return 'ok';
      } catch (error) {
        return (error as JevError).kind;
      }
    };
    const respond = (status: number, body = '{}') => (() => Promise.resolve(new Response(body, { status }))) as unknown as typeof fetch;
    expect(await kind(askJev(undefined, 'x', [], []))).toBe('no_key');
    expect(await kind(askJev('k', 'x', [], [], respond(503)))).toBe('http_5xx');
    expect(await kind(askJev('k', 'x', [], [], respond(401)))).toBe('http_4xx');
    expect(await kind(askJev('k', 'x', [], [], respond(200, 'not json')))).toBe('invalid');
    expect(await kind(askJev('k', 'x', [], [], (() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch))).toBe('network');
    const slow = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })));
      })) as unknown as typeof fetch;
    expect(await kind(askJev('k', 'x', [], [], slow, 20))).toBe('timeout');
  });

  it('waits at most a second by default', () => {
    expect(JEV_TIMEOUT_MS).toBe(1000);
  });
});

describe('jevRequest', () => {
  it('sends only the recent turns, clipped', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, text: `${i}`.repeat(1000) }));
    const request = jevRequest('今日は？', history, []);
    expect(request.state.conversation_context).toHaveLength(6);
    expect(request.state.conversation_context[0]!.text.length).toBeLessThanOrEqual(601);
    expect(Object.keys(request.questions).sort()).toEqual(['context_sufficient', 'period', 'required_tool', 'useful_tool']);
  });
});

describe('fixed rules', () => {
  it('have stable, unique ids', () => {
    expect(new Set(JEV_RULES.map((rule) => rule.id)).size).toBe(JEV_RULES.length);
  });

  it('reads yesterday when Jev read yesterday', () => {
    expect(matchRule({ message: '昨日の食事ってどうすればよかった？', period: 'yesterday', today: '2026-09-28', available: TOOLS })?.args).toEqual({
      date: '2026-09-27',
    });
  });

  it('stay quiet on other topics and when FIT LOG is not connected', () => {
    expect(matchRule({ message: '粗利率って何？', period: 'not_stated', today: '2026-09-28', available: TOOLS })).toBeNull();
    expect(matchRule({ message: '睡眠を良くするコツは？', period: 'not_stated', today: '2026-09-28', available: ['haksai_sales'] })).toBeNull();
  });
});
