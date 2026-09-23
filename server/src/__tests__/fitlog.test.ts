import type { Env } from '../env';
import {
  cleanCredential,
  fitlogConfigured,
  FITLOG_TODAY_TOOL,
  readFitlogTodayArgs,
  refersToFitness,
  refusalHint,
  runFitlogTodayTool,
  summarizeFitlogToday,
  type FitlogTodayRaw,
} from '../fitlog';

describe('fitlogConfigured', () => {
  it('returns true when URL and API key are set', () => {
    const env = {
      FITLOG_API_URL: 'https://fitlog.example.com',
      FITLOG_API_KEY: 'test-key',
    } as unknown as Env;
    expect(fitlogConfigured(env)).toBe(true);
  });

  it('returns true when URL and Access service token are set', () => {
    const env = {
      FITLOG_API_URL: 'https://fitlog.example.com',
      FITLOG_CLIENT_ID: 'cid',
      FITLOG_CLIENT_SECRET: 'csec',
    } as unknown as Env;
    expect(fitlogConfigured(env)).toBe(true);
  });

  it('returns false when URL is missing', () => {
    const env = {
      FITLOG_API_KEY: 'test-key',
    } as unknown as Env;
    expect(fitlogConfigured(env)).toBe(false);
  });

  it('returns false when credentials are missing', () => {
    const env = {
      FITLOG_API_URL: 'https://fitlog.example.com',
    } as unknown as Env;
    expect(fitlogConfigured(env)).toBe(false);
  });
});

describe('readFitlogTodayArgs', () => {
  it('defaults to today date when none provided', () => {
    expect(readFitlogTodayArgs({}, '2026-09-24')).toEqual({ date: '2026-09-24' });
    expect(readFitlogTodayArgs({ date: 'invalid' }, '2026-09-24')).toEqual({ date: '2026-09-24' });
  });

  it('accepts valid YYYY-MM-DD date', () => {
    expect(readFitlogTodayArgs({ date: '2026-09-20' }, '2026-09-24')).toEqual({ date: '2026-09-20' });
  });
});

describe('refersToFitness', () => {
  it('detects workout and diet queries', () => {
    expect(refersToFitness('今日の筋トレ何やったっけ？')).toBe(true);
    expect(refersToFitness('今日の体重教えて')).toBe(true);
    expect(refersToFitness('体脂肪率増えてる？')).toBe(true);
    expect(refersToFitness('今日摂取カロリーどれくらい？')).toBe(true);
    expect(refersToFitness('タンパク質足りてる？')).toBe(true);
    expect(refersToFitness('ワークアウトの記録')).toBe(true);
    expect(refersToFitness('有酸素運動した？')).toBe(true);
    expect(refersToFitness('FitLog見て')).toBe(true);
  });

  it('ignores unrelated queries', () => {
    expect(refersToFitness('Amazonの売上はどう？')).toBe(false);
    expect(refersToFitness('明日のスケジュール確認して')).toBe(false);
    expect(refersToFitness('こんにちは')).toBe(false);
  });
});

describe('cleanCredential', () => {
  it('strips headers or bearer prefix', () => {
    expect(cleanCredential('Bearer abc-123')).toBe('abc-123');
    expect(cleanCredential(' CF-Access-Client-Id: xyz ')).toBe('xyz');
  });
});

describe('refusalHint', () => {
  it('provides specific messages for different errors', () => {
    expect(refusalHint(401)).toContain('APIキー');
    expect(refusalHint(403)).toContain('Cloudflare Access');
    expect(refusalHint(404)).toContain('見つかりません');
    expect(refusalHint(500)).toContain('エラー');
  });
});

describe('summarizeFitlogToday', () => {
  it('formats raw today payload into clean executive summary', () => {
    const raw: FitlogTodayRaw = {
      status: 'ok',
      kcal: { eaten: 1800, target: 2200 },
      protein: { g: 120, target: 140 },
      fat: { g: 50, target: 60 },
      carb: { g: 200, target: 250 },
      weightKg: 68.5,
      bodyfatPercent: 15.2,
      weightDeltaKg: -0.3,
      weightTrend7d: [69.1, 68.9, 68.8, 68.5],
      exercise: { strengthSets: 12, cardioMinutes: 20 },
      workoutEntries: [
        {
          id: 'w1',
          name: 'ベンチプレス',
          type: 'strength',
          sets: [
            { weight: 80, reps: 10 },
            { weight: 80, reps: 8 },
          ],
          time: null,
          dist: null,
          level: null,
          floors: null,
          cardioKcal: null,
        },
      ],
      meals: [
        {
          id: 'm1',
          time: '12:30',
          label: '昼食',
          name: '鶏胸肉と玄米',
          kcal: 650,
          protein: 50,
          fat: 10,
          carb: 80,
        },
      ],
    };

    const summary = summarizeFitlogToday(raw, '2026-09-24');
    expect(summary['対象日']).toBe('2026-09-24');
    expect(summary['体組成']).toEqual({
      体重: '68.5kg',
      前日比: '-0.3kg',
      体脂肪率: '15.2%',
      直近7日体重推移: '69.1kg → 68.9kg → 68.8kg → 68.5kg',
    });
    expect((summary['運動状況'] as any)['筋トレセット数']).toBe(12);
    expect((summary['食事と栄養'] as any)['カロリー']['残り']).toBe('400kcal');
  });
});

describe('runFitlogTodayTool', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches data and returns formatted summary', async () => {
    const env = {
      FITLOG_API_URL: 'https://fitlog.example.com',
      FITLOG_API_KEY: 'test-token',
    } as unknown as Env;

    const fakePayload = {
      status: 'ok',
      kcal: { eaten: 1500, target: 2000 },
      protein: { g: 100, target: 120 },
      fat: { g: 40, target: 50 },
      carb: { g: 150, target: 200 },
      weightKg: 70,
      bodyfatPercent: 16,
      weightDeltaKg: 0,
      weightTrend7d: [70],
      exercise: { strengthSets: 5, cardioMinutes: 0 },
      workoutEntries: [],
      meals: [],
    };

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(fakePayload), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const result = await runFitlogTodayTool(env, { name: FITLOG_TODAY_TOOL.name, args: {} }, '2026-09-24');
    expect(result).toHaveProperty('対象日', '2026-09-24');
    expect((result as any)['体組成']['体重']).toBe('70kg');
  });

  it('handles API errors gracefully', async () => {
    const env = {
      FITLOG_API_URL: 'https://fitlog.example.com',
      FITLOG_API_KEY: 'test-token',
    } as unknown as Env;

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    const result = await runFitlogTodayTool(env, { name: FITLOG_TODAY_TOOL.name, args: {} }, '2026-09-24');
    expect(result).toHaveProperty('error');
    expect((result as any).error).toContain('APIキー');
  });
});
