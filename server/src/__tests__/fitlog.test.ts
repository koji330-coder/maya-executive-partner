import type { Env } from '../env';
import { FITLOG_TOOL } from '@/features/tools/catalog';
import {
  cleanCredential,
  fitlogConfigured,
  FITLOG_DAY_TOOL,
  FITLOG_EXERCISE_TOOL,
  FITLOG_NIGHT_DANGER_TOOL,
  FITLOG_NIGHTS_TOOL,
  FITLOG_PROGRESS_TOOL,
  FITLOG_WEEKLY_TOOL,
  readFitlogDayArgs,
  readFitlogExerciseArgs,
  readFitlogNightsArgs,
  readFitlogProgressArgs,
  readFitlogWeeklyArgs,
  refersToFitness,
  refersToNightOut,
  refusalHint,
  runFitlogDayTool,
  runFitlogNightDangerTool,
  runFitlogNightsTool,
  runFitlogWeeklyTool,
  summarizeFitlogDay,
  summarizeFitlogExercise,
  summarizeFitlogNight,
  summarizeFitlogNightDanger,
  summarizeFitlogNights,
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

  it('exposes six purpose-specific read tools', () => {
    const offered = [
      FITLOG_DAY_TOOL.name,
      FITLOG_PROGRESS_TOOL.name,
      FITLOG_WEEKLY_TOOL.name,
      FITLOG_EXERCISE_TOOL.name,
      FITLOG_NIGHTS_TOOL.name,
      FITLOG_NIGHT_DANGER_TOOL.name,
    ];
    expect(offered).toEqual([
      'fitlog_day',
      'fitlog_progress',
      'fitlog_weekly',
      'fitlog_exercise',
      'fitlog_nights',
      'fitlog_night_danger',
    ]);
    expect(FITLOG_TOOL.serverTools).toEqual(offered);
  });
});

describe('fitness routing and argument validation', () => {
  it('detects the expanded activity and progress vocabulary', () => {
    for (const message of [
      '今日の体重',
      'ウォーキングした？',
      '登山したっけ',
      '歩数は？',
      'TDEEは？',
      '自己ベスト',
      '1RM伸びた？',
      '体脂肪の目標まであと何％？',
      '9/18日のコンディションは？',
      '昨日の睡眠と飲酒はどうだった？',
      '腹囲は記録されてる？',
      '揚げ物と塩分が多かった日は？',
    ]) {
      expect(refersToFitness(message)).toBe(true);
    }
    expect(refersToFitness('Amazonの売上はどう？')).toBe(false);
    // ask の例は fitlog_* のどれかに向くことが目的で、必ずしも refersToFitness 単体で拾う必要はない
    // （帰宅支援の例は refersToNightOut が拾う）。
    for (const question of FITLOG_TOOL.ask) {
      expect(refersToFitness(question) || refersToNightOut(question)).toBe(true);
    }
  });

  it('detects night-out vocabulary separately from body/diet vocabulary', () => {
    for (const message of [
      '飲み会でどれくらい乗り過ごしてる？',
      '帰宅支援の記録を見せて',
      '自分の危険ラインは？',
      '終電逃したときの記録ある？',
      'タクシー代いくら使った？',
      '昨日また記憶があいまいだった',
    ]) {
      expect(refersToNightOut(message)).toBe(true);
    }
    expect(refersToNightOut('今日の体重は？')).toBe(false);
    expect(refersToNightOut('Amazonの売上はどう？')).toBe(false);
  });

  it('uses safe defaults for malformed tool arguments', () => {
    expect(readFitlogDayArgs({}, '2026-09-26')).toEqual({ date: '2026-09-26' });
    expect(readFitlogDayArgs({ date: '2026-09-18' }, '2026-09-26')).toEqual({ date: '2026-09-18' });
    expect(readFitlogDayArgs({ date: 'bad' }, '2026-09-26')).toEqual({
      date: null,
      error: '日付は実在する日をYYYY-MM-DD形式で指定してください。',
    });
    expect(readFitlogDayArgs({ date: '2026-02-30' }, '2026-09-26')).toEqual({
      date: null,
      error: '日付は実在する日をYYYY-MM-DD形式で指定してください。',
    });
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
    expect(readFitlogNightsArgs({})).toEqual({ scope: 'recent', limit: 30 });
    expect(readFitlogNightsArgs({ scope: 'all' })).toEqual({ scope: 'all', limit: 30 });
    expect(readFitlogNightsArgs({ scope: 'bogus' })).toEqual({ scope: 'recent', limit: 30 });
    expect(readFitlogNightsArgs({ limit: 5 })).toEqual({ scope: 'recent', limit: 5 });
    expect(readFitlogNightsArgs({ limit: 999 })).toEqual({ scope: 'recent', limit: 30 });
    expect(readFitlogNightsArgs({ limit: -3 })).toEqual({ scope: 'recent', limit: 30 });
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

  it('reports intake kcal and carbs including alcohol, matching the app', () => {
    const summary = summarizeFitlogDay(
      {
        status: 'ok',
        kcal: { eaten: 2836, target: 3000, alcohol: 617, total: 3453 },
        protein: { g: 120, target: 140 },
        fat: { g: 60, target: 70 },
        carb: { g: 276, target: 300, alcohol: 37, total: 313 },
        alcoholTotals: { pureAlcoholG: 67.6, kcal: 617, carbG: 37, purineMg: 0 },
        alcohol: [
          { id: 'a1', time: '20:00', drinkKey: 'beer_500', label: 'ビール', volumeMl: 500, abvPercent: 5, pureAlcoholG: 67.6 },
        ],
      },
      '2026-09-30',
    );
    const nutrition = summary['食事と栄養'] as Record<string, Record<string, unknown>>;
    expect(nutrition['カロリー']['摂取']).toBe('3453kcal（食事2836kcal＋お酒617kcal）');
    expect(nutrition['カロリー']['残り']).toBe('超過453kcal');
    expect(nutrition['PFC']['炭水化物']).toBe('313g / 目標300g（食事276g＋お酒の糖質37g）');
    const alcohol = (summary['コンディション'] as Record<string, Record<string, unknown>>)['飲酒'];
    expect(alcohol['お酒のkcal']).toContain('617kcal');
  });

  it('falls back to meal-only values when the server has no alcohol totals', () => {
    const summary = summarizeFitlogDay(
      { status: 'ok', kcal: { eaten: 1800, target: 2300 }, carb: { g: 200, target: 250 } },
      '2026-09-30',
    );
    const nutrition = summary['食事と栄養'] as Record<string, Record<string, unknown>>;
    expect(nutrition['カロリー']['摂取']).toBe('1800kcal（食事1800kcal＋お酒0kcal）');
  });

  it('returns a dated condition snapshot without exposing steps or double-counting alcohol tags', () => {
    const summary = summarizeFitlogDay(
      {
        status: 'ok',
        meals: [
          {
            id: 'm1',
            time: '19:00',
            label: '夕食',
            name: '唐揚げ定食',
            kcal: 800,
            protein: 35,
            fat: 32,
            carb: 80,
            tags: { salt: 'high', fried: true, fiber: 'low', alcohol: true },
          },
          {
            id: 'm2',
            time: '12:00',
            label: '昼食',
            name: 'そば',
            kcal: 500,
            protein: 18,
            fat: 8,
            carb: 70,
            tags: null,
          },
        ],
        alcohol: [
          {
            id: 'a1',
            time: '20:00',
            drinkKey: 'beer_500',
            label: 'ビール',
            volumeMl: 500,
            abvPercent: 5,
            pureAlcoholG: 20,
          },
        ],
        waistCm: 78.5,
        steps: 99999,
        sleep: { totalMin: 330, deepMin: 50, remMin: 70 },
        sleepTrend14: [
          { date: '2026-09-16', deepMin: 60, remMin: 80, coreMin: 280 },
          { date: '2026-09-17', deepMin: 50, remMin: 70, coreMin: 300 },
          { date: '2026-09-18', deepMin: 50, remMin: 70, coreMin: 210 },
        ],
      },
      '2026-09-18',
    );

    const condition = summary['コンディション'] as Record<string, Record<string, unknown> | string>;
    expect((condition['睡眠'] as Record<string, unknown>)['合計']).toBe('5時間30分（330分）');
    expect((condition['睡眠'] as Record<string, unknown>)['平均との差']).toBe('-90分');
    expect((condition['飲酒'] as Record<string, unknown>)['純アルコール合計']).toBe('20g');
    expect(condition['腹囲']).toBe('78.5cm（対象日ちょうどの記録）');
    expect((condition['食事の質'] as Record<string, unknown>)['タグ判定済み']).toBe('1/2食');
    expect((condition['食事の質'] as Record<string, unknown>)['揚げ物または脂多め']).toBe(1);
    expect(condition['歩数']).toBe('99999歩（対象日ちょうどの記録。ヘルスケア由来）');
  });

  it('distinguishes missing condition records from zero or no issue', () => {
    const summary = summarizeFitlogDay({ status: 'ok', meals: [] }, '2026-09-18');
    const condition = summary['コンディション'] as Record<string, Record<string, unknown> | string>;
    expect((condition['睡眠'] as Record<string, unknown>)['注記']).toContain('0分ではなく');
    expect((condition['飲酒'] as Record<string, unknown>)['注記']).toContain('飲まなかったという意味ではなく');
    expect(condition['腹囲']).toContain('未記録');
    expect(condition['歩数']).toBe('未記録');
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
        avgKcalWithAlcohol: 2300,
        alcohol: { days: 2, pureAlcoholG: 90, kcal: 1400, carbG: 50, purineMg: 0 },
        targetKcal: 2200,
        avgTargetKcal: 2350,
        avgBonusKcal: 150,
        weightStart: 70,
        weightEnd: 69.5,
        weightDays: 5,
      },
    });
    expect((summary['運動'] as Record<string, unknown>)['ジム']).toBe('3日（前週2日）');
    expect((summary['体重'] as Record<string, unknown>)['変化']).toBe('-0.5kg');
    expect(summary['注意']).toContain('AIコメント');
    const meals = summary['食事'] as Record<string, unknown>;
    expect(meals['平均摂取']).toBe('2300kcal/日（お酒込み。食事のみでは2100kcal/日）');
    expect((meals['飲酒'] as Record<string, unknown>)['お酒のkcal合計']).toBe('1400kcal');
    expect(meals['注記']).toContain('すでに加算');
    expect(meals['運動日の追加分込みの目標']).toBe('2350kcal/日（運動日の追加分は平均150kcal/日）');
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

  it('narrows a night to quantity, outcome, return method, cost and failure cause, with station names but no venue area', () => {
    const summary = summarizeFitlogNight({
      night_date: '2026-09-29',
      outcome: 'overshoot',
      memory: 'hazy',
      hangover: 'heavy',
      extra_drinks: 1,
      drinks_count: 4,
      pure_alcohol_g: 72,
      kcal: 1200,
      max_pace_g_per_h: 45,
      water_count: 1,
      return_method: 'taxi',
      return_cost_yen: 3200,
      failure_cause: '飲むペースが速すぎた',
      failure_tags: ['pace', 'no_water'],
      farthest_station: '町田',
      prompts_total: 4,
      prompts_answered: 1,
      max_alert_level: 3,
      answered_at: 1234567890,
      dismissed_at: null,
      report: { train: { alightedBy: '橋本' } },
    });
    expect(JSON.stringify(summary)).not.toContain('venue');
    expect((summary['量'] as Record<string, unknown>)['純アルコール合計']).toBe('72g');
    expect((summary['結果'] as Record<string, unknown>)['種別']).toBe('乗り過ごした');
    expect((summary['結果'] as Record<string, unknown>)['記憶']).toBe('あいまい');
    expect((summary['帰り方'] as Record<string, unknown>)['方法']).toBe('タクシー');
    expect((summary['帰り方'] as Record<string, unknown>)['最遠到達駅']).toBe('町田');
    expect((summary['帰り方'] as Record<string, unknown>)['実際に降りた駅']).toBe('橋本');
    expect(summary['費用']).toBe('3200円');
    expect((summary['敗因'] as Record<string, unknown>)['内容']).toBe('飲むペースが速すぎた');
  });

  it('does not treat an unanswered night as a bad or good outcome', () => {
    const summary = summarizeFitlogNight({
      night_date: '2026-09-30',
      outcome: 'normal',
      memory: null,
      hangover: null,
      extra_drinks: null,
      drinks_count: 2,
      pure_alcohol_g: 24,
      kcal: 400,
      max_pace_g_per_h: null,
      water_count: 0,
      return_method: null,
      return_cost_yen: null,
      failure_cause: null,
      failure_tags: [],
      farthest_station: null,
      prompts_total: null,
      prompts_answered: null,
      max_alert_level: null,
      answered_at: null,
      dismissed_at: null,
      report: null,
    });
    expect(summary['回答状況']).toBe('未回答（翌朝のふりかえり待ち）');
    expect((summary['結果'] as Record<string, unknown>)['記憶']).toBe('未回答');
    expect(summary['費用']).toBe('未回答');
    expect((summary['敗因'] as Record<string, unknown>)['タグ']).toBe('なし');
  });

  it('labels a full night list with its scope', () => {
    const summary = summarizeFitlogNights([], '直近30件');
    expect(summary['対象範囲']).toBe('直近30件');
    expect(summary['件数']).toBe(0);
    expect(summary['夜ごと']).toEqual([]);
  });

  it('summarizes the danger line with whether it is learned yet, and never claims a medical judgment', () => {
    const summary = summarizeFitlogNightDanger({
      lineG: 60,
      lineLearned: false,
      paceLine: 40,
      paceLearned: false,
      nights: 5,
      badNights: 2,
      above: { nights: 2, bad: 2 },
      below: { nights: 3, bad: 0 },
      waterNights: { nights: 1, bad: 0 },
      costYenThisYear: 8400,
      tags: [{ tag: 'pace', count: 2 }],
      sleepLastNightMin: 240,
      sleepShort: true,
      todayLineG: 48,
    });
    expect((summary['危険ライン'] as Record<string, unknown>)['学習済みか']).toContain('仮の値');
    expect((summary['危険ライン'] as Record<string, unknown>)['今日の危険ライン']).toBe('48g（前夜の睡眠不足のため8割に下げています）');
    expect(summary['今年の帰宅費用']).toBe('8400円');
    expect(summary['注意']).toContain('医学的な判断ではありません');
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

  it('fetches the explicitly requested past date instead of silently using today', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const result = await runFitlogDayTool(env, { name: FITLOG_DAY_TOOL.name, args: { date: '2026-09-18' } }, '2026-09-26');
    expect(result).toHaveProperty('対象日', '2026-09-18');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://fitlog.example.com/today?date=2026-09-18',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects an invalid explicit date without making a request for today', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const result = await runFitlogDayTool(env, { name: FITLOG_DAY_TOOL.name, args: { date: '9/18' } }, '2026-09-26');
    expect(result).toHaveProperty('error');
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('reads recent nights from GET /nights with a bounded limit, never /nights/pending', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ok', nights: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const result = await runFitlogNightsTool(env, { name: FITLOG_NIGHTS_TOOL.name, args: {} });
    expect(result).toHaveProperty('対象範囲', '直近30件');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://fitlog.example.com/nights?limit=30', expect.objectContaining({ method: 'GET' }));
    const calledUrl = fetchMock.mock.calls[0]?.[0];
    expect(String(calledUrl)).not.toContain('/nights/pending');
  });

  it('reads the full history from GET /nights/export when scope is "all"', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: 'ok', exportedAt: '2026-09-30T00:00:00Z', note: '', stats: {}, nights: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const result = await runFitlogNightsTool(env, { name: FITLOG_NIGHTS_TOOL.name, args: { scope: 'all' } });
    expect(result).toHaveProperty('対象範囲', '全期間');
    expect(fetchMock).toHaveBeenCalledWith('https://fitlog.example.com/nights/export?', expect.objectContaining({ method: 'GET' }));
  });

  it('reads the danger line from GET /nights/stats', async () => {
    const stats = {
      lineG: 60,
      lineLearned: true,
      paceLine: 40,
      paceLearned: true,
      nights: 10,
      badNights: 3,
      above: { nights: 3, bad: 3 },
      below: { nights: 7, bad: 0 },
      waterNights: { nights: 2, bad: 0 },
      costYenThisYear: 15000,
      tags: [],
      sleepLastNightMin: 400,
      sleepShort: false,
      todayLineG: 60,
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ok', stats }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const result = await runFitlogNightDangerTool(env);
    expect((result['危険ライン'] as Record<string, unknown>)['純アルコール']).toBe('60g');
    expect(fetchMock).toHaveBeenCalledWith('https://fitlog.example.com/nights/stats?', expect.objectContaining({ method: 'GET' }));
  });
});
