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
  type BodyRecord,
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

  it('detects outdoor activity queries', () => {
    expect(refersToFitness('今日の屋外活動は？')).toBe(true);
    expect(refersToFitness('今日どれくらい歩いた？')).toBe(true);
    expect(refersToFitness('ランニングの記録ある？')).toBe(true);
    expect(refersToFitness('ウォーキングしたっけ')).toBe(true);
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
    expect((summary['運動状況'] as any)['筋トレセット数']).toBe(12);
    expect((summary['食事と栄養'] as any)['カロリー']['残り']).toBe('400kcal');
    expect(summary['屋外活動']).toEqual({ 記録: '記録なし', 消費カロリー合計: '0kcal' });
  });

  it('reports outdoor activities and the kcal bonus they add to the target', () => {
    const raw: FitlogTodayRaw = {
      status: 'ok',
      kcal: { eaten: 1800, target: 2500 },
      kcalBonus: { gym: 200, outdoor: 300, total: 500 },
      outdoor: [
        { id: 'o1', time: '07:10', activityType: 'walking', distance: 5.2, duration: 62, kcal: 250 },
        { id: 'o2', time: null, activityType: 'cycling', distance: null, duration: 30, kcal: 120 },
      ],
    };
    const summary = summarizeFitlogToday(raw, '2026-09-24');
    expect(summary['屋外活動']).toEqual({
      記録: ['07:10 ウォーキング (62分 / 5.2km / 250kcal)', 'サイクリング (30分 / 120kcal)'],
      消費カロリー合計: '370kcal',
    });
    expect((summary['食事と栄養'] as any)['カロリー']['目標の内訳']).toBe('基本 2000kcal + ジム日 200kcal + 屋外活動 300kcal');
  });

  it('dates the weight from history, and says when the day itself has no record', () => {
    const history: BodyRecord[] = [
      { date: '2026-09-20', weight: 69.1, bodyfat: 16.0 },
      { date: '2026-09-22', weight: 68.8, bodyfat: null },
      { date: '2026-09-25', weight: 68.0, bodyfat: 15.0 },
    ];
    const body = summarizeFitlogToday({ status: 'ok', weightKg: 68.8, hasBodyMetrics: false }, '2026-09-24', history)['体組成'];
    expect(body).toEqual({
      体重: '68.8kg（2026-09-22の記録）',
      体重の記録日: '2026-09-22',
      対象日の体重記録: 'なし。2026-09-22の記録を表示',
      前回記録比: '-0.3kg（2026-09-20比）',
      体脂肪率: '16%（2026-09-20の記録）',
      直近の体重記録: ['2026-09-20 69.1kg', '2026-09-22 68.8kg'],
    });
  });

  it('marks the weight as that day when it was recorded that day', () => {
    const history: BodyRecord[] = [{ date: '2026-09-24', weight: 68.5, bodyfat: 15.2 }];
    const body = summarizeFitlogToday({ status: 'ok' }, '2026-09-24', history)['体組成'] as any;
    expect(body['体重']).toBe('68.5kg（2026-09-24の記録）');
    expect(body['対象日の体重記録']).toBe('あり');
  });

  it('says the date is unknown when history could not be read', () => {
    const body = summarizeFitlogToday({ status: 'ok', weightKg: 68.8, hasBodyMetrics: false, weightDeltaKg: -0.3 }, '2026-09-24')['体組成'] as any;
    expect(body['体重']).toBe('68.8kg（2026-09-24より前の直近の記録。記録日は不明）');
    expect(body['対象日の体重記録']).toBe('なし');
    expect(body['前回記録比']).toBe('-0.3kg');
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

    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/body-metrics/history')
        ? new Response(JSON.stringify({ status: 'ok', history: [{ date: '2026-09-23', weight: 70, bodyfat: 16 }] }), { status: 200 })
        : new Response(JSON.stringify(fakePayload), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const result = await runFitlogTodayTool(env, { name: FITLOG_TODAY_TOOL.name, args: {} }, '2026-09-24');
    expect(result).toHaveProperty('対象日', '2026-09-24');
    expect((result as any)['体組成']['体重']).toBe('70kg（2026-09-23の記録）');
    expect(fetchMock).toHaveBeenCalledWith('https://fitlog.example.com/body-metrics/history?days=30', expect.anything());
  });

  it('still answers when the weight history cannot be read', async () => {
    const env = {
      FITLOG_API_URL: 'https://fitlog.example.com',
      FITLOG_API_KEY: 'test-token',
    } as unknown as Env;
    jest.spyOn(global, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/body-metrics/history')
        ? new Response('boom', { status: 500 })
        : new Response(JSON.stringify({ status: 'ok', weightKg: 70, hasBodyMetrics: true }), { status: 200 }),
    );

    const result = await runFitlogTodayTool(env, { name: FITLOG_TODAY_TOOL.name, args: {} }, '2026-09-24');
    expect((result as any)['体組成']['体重']).toBe('70kg（2026-09-24の記録）');
  });

  it('handles API errors gracefully', async () => {
    const env = {
      FITLOG_API_URL: 'https://fitlog.example.com',
      FITLOG_API_KEY: 'test-token',
    } as unknown as Env;

    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('Unauthorized', { status: 401 }));

    const result = await runFitlogTodayTool(env, { name: FITLOG_TODAY_TOOL.name, args: {} }, '2026-09-24');
    expect(result).toHaveProperty('error');
    expect((result as any).error).toContain('APIキー');
  });
});
