import type { Env } from '../env';
import {
  cleanCredential,
  fitlogConfigured,
  FITLOG_DAY_TOOL,
  FITLOG_EXERCISE_TOOL,
  FITLOG_PROGRESS_TOOL,
  FITLOG_WEEKLY_TOOL,
  readFitlogDayArgs,
  readFitlogExerciseArgs,
  readFitlogProgressArgs,
  readFitlogWeeklyArgs,
  refersToFitness,
  refusalHint,
  runFitlogDayTool,
  runFitlogWeeklyTool,
  summarizeFitlogDay,
  summarizeFitlogExercise,
  summarizeFitlogProgress,
  summarizeFitlogWeekly,
  type FitlogTodayRaw,
} from '../fitlog';

const env = {
  FITLOG_API_URL: 'https://fitlog.example.com',
  FITLOG_API_KEY: 'test-token',
} as unknown as Env;

describe('fitlog configuration and declarations', () => {
  it('requires a URL and one supported credential form', () => {
    expect(fitlogConfigured(env)).toBe(true);
    expect(
      fitlogConfigured({ FITLOG_API_URL: 'https://fitlog.example.com', FITLOG_CLIENT_ID: 'cid', FITLOG_CLIENT_SECRET: 'secret' } as Env),
    ).toBe(true);
    expect(fitlogConfigured({ FITLOG_API_KEY: 'key' } as Env)).toBe(false);
    expect(fitlogConfigured({ FITLOG_API_URL: 'https://fitlog.example.com' } as Env)).toBe(false);
  });

  it('exposes four purpose-specific read tools', () => {
    expect([FITLOG_DAY_TOOL.name, FITLOG_PROGRESS_TOOL.name, FITLOG_WEEKLY_TOOL.name, FITLOG_EXERCISE_TOOL.name]).toEqual([
      'fitlog_day',
      'fitlog_progress',
      'fitlog_weekly',
      'fitlog_exercise',
    ]);
  });
});

describe('fitness routing and argument validation', () => {
  it('detects the expanded activity and progress vocabulary', () => {
    for (const message of ['今日の体重', 'ウォーキングした？', '登山したっけ', '歩数は？', 'TDEEは？', '自己ベスト', '1RM伸びた？', '体脂肪の目標まであと何％？']) {
      expect(refersToFitness(message)).toBe(true);
    }
    expect(refersToFitness('Amazonの売上はどう？')).toBe(false);
  });

  it('uses safe defaults for malformed tool arguments', () => {
    expect(readFitlogDayArgs({ date: 'bad' }, '2026-09-26')).toEqual({ date: '2026-09-26' });
    expect(readFitlogWeeklyArgs({}, '2026-09-26')).toEqual({ referenceDate: '2026-09-26' });
    expect(readFitlogProgressArgs({ window_days: 13, tdee_window_days: 31 }, '2026-09-26')).toEqual({
      endDate: '2026-09-26',
      windowDays: 28,
      tdeeWindowDays: 90,
    });
    expect(readFitlogProgressArgs({ end_date: '2026-09-20', window_days: 42, tdee_window_days: 180 }, '2026-09-26')).toEqual({
      endDate: '2026-09-20',
      windowDays: 42,
      tdeeWindowDays: 180,
    });
    expect(readFitlogExerciseArgs({ name: '  ベンチプレス  ' })).toEqual({ name: 'ベンチプレス' });
  });
});

describe('credential and HTTP error messages', () => {
  it('cleans copied header values', () => {
    expect(cleanCredential('Bearer abc-123')).toBe('abc-123');
    expect(cleanCredential(' CF-Access-Client-Id: xyz ')).toBe('xyz');
  });

  it('provides actionable status messages', () => {
    expect(refusalHint(401)).toContain('APIキー');
    expect(refusalHint(403)).toContain('Cloudflare Access');
    expect(refusalHint(404)).toContain('見つかりません');
    expect(refusalHint(500)).toContain('HTTP 500');
  });
});

describe('FIT LOG summaries', () => {
  it('does not present a fallback measurement as the requested date', () => {
    const raw: FitlogTodayRaw = {
      status: 'ok',
      kcal: { eaten: 1800, target: 2300 },
      kcalBonus: { gym: 200, outdoor: 100, total: 300 },
      protein: { g: 120, target: 140 },
      fat: { g: 50, target: 60 },
      carb: { g: 200, target: 250 },
      weightKg: 68.5,
      bodyfatPercent: 15.2,
      targetBodyfat: 15,
      weightDeltaKg: -0.3,
      weightTrend7d: [69.1, 68.8, 68.5],
      hasBodyMetrics: false,
      bodyMetricsMeta: {
        requestedDate: '2026-09-26',
        hasEntryOnDate: false,
        weightRecordedDate: '2026-09-25',
        bodyfatRecordedDate: '2026-09-24',
        weightSource: 'health',
        bodyfatSource: null,
        healthLastSync: '2026-09-26T01:00:00Z',
      },
      exercise: { strengthSets: 5, cardioMinutes: 20 },
      workoutEntries: [],
      outdoor: [
        {
          id: 'o1',
          time: '08:00',
          activityType: 'walking',
          distance: 4.2,
          duration: 50,
          avgHeartRate: 105,
          kcal: 220,
          elevationGain: 30,
          source: 'health',
        },
      ],
      meals: [],
    };

    const summary = summarizeFitlogDay(raw, '2026-09-26');
    expect((summary['体組成'] as Record<string, unknown>)['体重']).toBe('68.5kg（2026-09-25の直近記録）');
    expect((summary['体組成'] as Record<string, unknown>)['前回測定比']).toBe('-0.3kg');
    expect((summary['記録の状態'] as Record<string, unknown>)['体重の出所']).toBe('Appleヘルスケア');
    expect((summary['運動'] as Record<string, unknown>)['屋外運動']).toEqual([
      'ウォーキング 08:00（50分、4.2km、220kcal、平均心拍105、獲得標高30m／Appleヘルスケア）',
    ]);
  });

  it('selects only the requested progress windows and carries reliability', () => {
    const summary = summarizeFitlogProgress(
      {
        status: 'ok',
        tdee: {
          targetKcal: 2200,
          windows: [
            { windowDays: 90, tdee: 2450, avgIntake: 2200, pacePerWeek: -0.2, deficit: 250, mealDays: 82, weightDays: 40, reliable: true, reason: 'ok' },
          ],
        },
        composition: {
          '28': {
            summary: {
              windowDays: 28,
              weight: { start: 70, current: 69, delta: -1 },
              fat: { start: 12, current: 11.2, delta: -0.8 },
              lean: { start: 58, current: 57.8, delta: -0.2 },
            },
          },
        },
        weeklyOutput: { '28': [] },
        strength: {
          '28': [{ name: 'ベンチプレス', recordCount: 8, recentAvg: 91, prevAvg: 88, growth: 0.034, dataSufficient: true }],
        },
      },
      { status: 'ok', bodyfat15: { target: 15, avg: 15.6, samples: 5, minSamples: 3, firstBodyfat: 20, firstDate: '2026-01-01', unlockedAt: null } },
      '2026-09-26',
      28,
      90,
    );
    expect((summary['体組成'] as Record<string, unknown>)['脂肪量']).toBe('12kg → 11.2kg（-0.8kg）');
    expect((summary['実測TDEE'] as Record<string, unknown>)['信頼できる計算か']).toBe(true);
    expect((summary['体脂肪率目標'] as Record<string, unknown>)['現在地']).toBe('あと0.6ポイント');
  });

  it('returns weekly facts without using an AI comment', () => {
    const summary = summarizeFitlogWeekly({
      status: 'ok',
      weekStart: '2026-09-14',
      weekEnd: '2026-09-20',
      hasActivity: true,
      badges: [],
      facts: {
        gymDays: 3,
        prevGymDays: 2,
        strengthSets: 30,
        volume: 12000,
        prevVolume: 10000,
        cardioMinutes: 45,
        prs: [{ name: 'ベンチプレス', weight: 80, reps: 8, date: '2026-09-18' }],
        outdoorCount: 2,
        outdoorDistance: 8,
        outdoorKcal: 500,
        outdoorMinutes: 100,
        mealDays: 7,
        proteinHitDays: 5,
        avgKcal: 2100,
        targetKcal: 2200,
        weightStart: 70,
        weightEnd: 69.5,
        weightDays: 5,
      },
    });
    expect((summary['運動'] as Record<string, unknown>)['ジム']).toBe('3日（前週2日）');
    expect((summary['体重'] as Record<string, unknown>)['変化']).toBe('-0.5kg');
    expect(summary['注意']).toContain('AIコメント');
  });

  it('keeps exercise history compact', () => {
    const summary = summarizeFitlogExercise(
      {
        status: 'ok',
        machine: { name: 'ベンチプレス', area: '上半身', part: '胸', type: 'strength', techniqueMemo: null },
        best: { weight: 80, reps: 8, date: '2026-09-20' },
        latest: { date: '2026-09-20', best: { weight: 80, reps: 8 }, sets: [{ weight: 80, reps: 8 }] },
        volume28d: 5000,
        recordCount: 10,
        trend: [{ date: '2026-09-20', e1rm: 96 }],
        records: [],
      },
      'ベンチプレス',
    );
    expect(summary['自己ベスト']).toBe('80kg×8回（2026-09-20）');
    expect(summary['直近28日ボリューム']).toBe('5000kg');
  });
});

describe('read-only HTTP calls', () => {
  afterEach(() => jest.restoreAllMocks());

  it('fetches a daily snapshot with GET', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ok', weightKg: 70 }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const result = await runFitlogDayTool(env, { name: FITLOG_DAY_TOOL.name, args: {} }, '2026-09-26');
    expect(result).toHaveProperty('対象日', '2026-09-26');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://fitlog.example.com/today?date=2026-09-26',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('uses factsOnly for weekly data so FIT LOG does not generate or save AI text', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: 'ok', weekStart: '2026-09-14', weekEnd: '2026-09-20', hasActivity: false, facts: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await runFitlogWeeklyTool(env, { name: FITLOG_WEEKLY_TOOL.name, args: {} }, '2026-09-26');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://fitlog.example.com/recap/weekly?date=2026-09-26&factsOnly=1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('turns an API refusal into a tool result instead of throwing', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    const result = await runFitlogDayTool(env, { name: FITLOG_DAY_TOOL.name, args: {} }, '2026-09-26');
    expect(result).toHaveProperty('error');
    expect(String(result.error)).toContain('APIキー');
  });
});
