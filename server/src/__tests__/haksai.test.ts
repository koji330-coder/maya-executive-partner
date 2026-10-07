import { AMAZON_TOOLS } from '@/features/tools/catalog';

import type { Env } from '../env';
import {
  callMcp,
  cleanCredential,
  commonTitle,
  DEFAULT_LIMIT,
  haksaiConfigured,
  historyNeeds,
  keepaFetchConfigured,
  HaksaiError,
  HAKSAI_AD_CHANGES_TOOL,
  HAKSAI_ADS_TOOL,
  HAKSAI_FORECAST_TOOL,
  HAKSAI_INVENTORY_TOOL,
  HAKSAI_MARKET_TOOL,
  HAKSAI_SALES_TOOL,
  priceTrial,
  readInventoryArgs,
  readMarketArgs,
  refusalHint,
  refersToAmazon,
  readAdChangesArgs,
  readAdsArgs,
  readForecastArgs,
  readSalesArgs,
  runHaksaiAdChangesTool,
  runHaksaiAdsTool,
  runHaksaiForecastTool,
  runHaksaiMarketTool,
  summarizeAdChanges,
  summarizeAds,
  summarizeForecast,
  runHaksaiSalesTool,
  summarizeMarket,
  unitProfit,
  yenLabel,
  summarizeMonth,
  readVariations,
  runHaksaiInventoryTool,
  variationLabels,
} from '../haksai';

const env = (over: Partial<Env> = {}): Env =>
  ({
    HAKSAI_MCP_URL: 'https://haksai.example/mcp',
    HAKSAI_MCP_CLIENT_ID: 'id.access',
    HAKSAI_MCP_CLIENT_SECRET: 'secret',
    ...over,
  }) as Env;

/** An MCP answer: a JSON-RPC envelope carrying the tool's JSON as text. */
const mcpReply = (envelope: unknown) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(envelope) }] } }), {
    status: 200,
  });

const variation = (asin: string, size: string, colour: string, sold: number) => ({
  asin,
  title: `[HAKSAI] パジャマ メンズ 長袖 (JP, アルファベット, ${size}, ${colour})`,
  totalUnitsSold: sold,
});

const inventory = (state: string, available: number, qty: number, warnings: string[] = []) => ({
  data: {
    snapshot: { date: '2026-09-19', rows: [{ available }] },
    plan: { state, sellingPacePerDay: 0.35, coverTotalDays: 3, orderBy: '2026-08-24', runoutDate: '2026-09-21', recommendedOrderQty: qty },
  },
  meta: { warnings },
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('haksaiConfigured', () => {
  it('needs the address and both halves of the token', () => {
    expect(haksaiConfigured(env())).toBe(true);
    expect(haksaiConfigured(env({ HAKSAI_MCP_CLIENT_SECRET: undefined }))).toBe(false);
    expect(haksaiConfigured({} as Env)).toBe(false);
  });
});

describe('readInventoryArgs', () => {
  it('keeps a trimmed query and clamps the count', () => {
    expect(readInventoryArgs({ query: ' パジャマ ', limit: 99 })).toEqual({ query: 'パジャマ', limit: 25 });
    expect(readInventoryArgs({ query: 'x', limit: 0 })).toEqual({ query: 'x', limit: 1 });
    expect(readInventoryArgs({ query: 'x' }).limit).toBe(DEFAULT_LIMIT);
  });

  it('reports a missing query as empty rather than guessing', () => {
    expect(readInventoryArgs({}).query).toBe('');
    expect(readInventoryArgs({ query: 42 }).query).toBe('');
  });
});

describe('variationLabels', () => {
  it('keeps only what tells the variations apart', () => {
    const labels = variationLabels([variation('B0A', 'M', 'A08', 34), variation('B0B', 'L', 'A02', 32)]);
    expect(labels.get('B0A')).toBe('M A08');
    expect(labels.get('B0B')).toBe('L A02');
  });

  it('falls back to the ASIN when the title says nothing', () => {
    expect(variationLabels([{ asin: 'B0C', title: 'ただの商品名', totalUnitsSold: 1 }]).get('B0C')).toBe('B0C');
  });
});

describe('commonTitle', () => {
  it('drops the per-variation bracket', () => {
    expect(commonTitle([variation('B0A', 'M', 'A08', 3)])).toBe('[HAKSAI] パジャマ メンズ 長袖');
  });
});

describe('readVariations', () => {
  it('flattens the parent groups and skips malformed rows', () => {
    const items = readVariations({
      groups: [{ variations: [variation('B0A', 'M', 'A08', 3), { title: 'ASINがない' }] }, { variations: 'not a list' }],
    });
    expect(items.map((item) => item.asin)).toEqual(['B0A']);
  });
});

describe('callMcp', () => {
  it('refuses to call without the token, rather than trying and leaking a 302', async () => {
    await expect(callMcp(env({ HAKSAI_MCP_CLIENT_ID: undefined }), 'x', {})).rejects.toBeInstanceOf(HaksaiError);
  });

  it('reads the tool JSON out of the JSON-RPC envelope', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(mcpReply({ data: { ok: 1 } }));
    await expect(callMcp(env(), 'haksai_get_inventory', { asin: 'B0A' })).resolves.toEqual({ data: { ok: 1 } });
  });

  it('sends the token as headers and asks for one named tool', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mcpReply({ data: {} }));
    await callMcp(env(), 'haksai_get_inventory', { asin: 'B0A' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://haksai.example/mcp');
    expect((init!.headers as Record<string, string>)['CF-Access-Client-Id']).toBe('id.access');
    expect(JSON.parse(init!.body as string)).toMatchObject({ method: 'tools/call', params: { name: 'haksai_get_inventory' } });
  });

  it('blames the token when Access redirects instead of answering', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 302 }));
    await expect(callMcp(env(), 'x', {})).rejects.toThrow(/サービストークン/);
  });

  it('does not follow the redirect, and says the number', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 403 }));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(callMcp(env(), 'x', {})).rejects.toThrow(/（403）/);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).redirect).toBe('manual');
  });
});

describe('runHaksaiInventoryTool', () => {
  it('searches by name, then asks about the best sellers, and sorts them into what needs a decision', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.params.name === 'haksai_search_products') {
        return Promise.resolve(
          mcpReply({
            data: { groups: [{ variations: [variation('B0A', 'M', 'A03', 32), variation('B0B', 'L', 'A08', 22), variation('B0C', 'XL', 'A06', 8)] }] },
          }),
        );
      }
      const asin = body.params.arguments.asin;
      if (asin === 'B0A') return Promise.resolve(mcpReply(inventory('urgent', 1, 26, ['在庫レポートは1日分だけです。'])));
      if (asin === 'B0B') return Promise.resolve(mcpReply(inventory('ok', 21, 0)));
      return Promise.resolve(mcpReply(inventory('idle', 6, 0)));
    });

    const result = (await runHaksaiInventoryTool(env(), { name: 'haksai_inventory', args: { query: 'パジャマ メンズ' } })) as Record<string, unknown>;

    expect(result.商品).toBe('[HAKSAI] パジャマ メンズ 長袖');
    expect(result.基準日).toBe('2026-09-19');
    expect(result.すぐ発注).toEqual([
      {
        種類: 'M A03',
        ASIN: 'B0A',
        在庫: 1,
        日販: 0.35,
        在庫日数: 3,
        発注期限: '2026-08-24',
        売切予定: '2026-09-21',
        推奨数: 26,
        緊急: true,
      },
    ]);
    expect(result.推奨合計).toBe(26);
    expect(result.余裕あり).toEqual(['L A08（在庫21、3日分）']);
    expect(result.動きなし).toEqual(['XL A06（在庫6）']);
    expect(result.注意).toContain('在庫レポートは1日分だけです。');
    expect(result.注意).toContain('推奨発注数は計算値です。最小ロットと、発注済みで未着の数は含みません。');
  });

  it('asks for a shorter name rather than inventing a product', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(mcpReply({ data: { groups: [] } }));
    const result = (await runHaksaiInventoryTool(env(), { name: 'haksai_inventory', args: { query: 'ないもの' } })) as { error: string };
    expect(result.error).toMatch(/見つかりませんでした/);
  });

  it('goes straight to stock when the president already knows the ASIN', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mcpReply(inventory('urgent', 0, 11)));
    await runHaksaiInventoryTool(env(), { name: 'haksai_inventory', args: { query: 'b0fxtqpgsb' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string).params).toMatchObject({
      name: 'haksai_get_inventory',
      arguments: { asin: 'B0FXTQPGSB' },
    });
  });

  it('says a connection failed instead of returning an empty answer', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    expect(await runHaksaiInventoryTool(env(), { name: 'haksai_inventory', args: { query: 'パジャマ' } })).toEqual({
      error: expect.stringContaining('HAKSAI に接続できませんでした'),
    });
  });

  it('will not run without a query', async () => {
    expect(await runHaksaiInventoryTool(env(), { name: 'haksai_inventory', args: {} })).toEqual({ error: '商品名を指定してください。' });
  });
});

describe('readSalesArgs', () => {
  it('means this month, in the calendar of the president, when no month is given or it is malformed', () => {
    expect(readSalesArgs({}, '2026-09-21').month).toBe('2026-09');
    expect(readSalesArgs({ month: '9月' }, '2026-09-21').month).toBe('2026-09');
    expect(readSalesArgs({ month: '2026-13' }, '2026-09-21').month).toBe('2026-09');
    expect(readSalesArgs({ month: ' 2026-08 ' }, '2026-09-21').month).toBe('2026-08');
  });

  it('clamps the count and refuses an unknown ordering', () => {
    expect(readSalesArgs({ top: 99 }, '2026-09-21').top).toBe(15);
    expect(readSalesArgs({ top: 0 }, '2026-09-21').top).toBe(1);
    expect(readSalesArgs({}, '2026-09-21')).toMatchObject({ top: 5, sortBy: 'sales' });
    expect(readSalesArgs({ sort_by: 'DROP TABLE' }, '2026-09-21').sortBy).toBe('sales');
    expect(readSalesArgs({ sort_by: 'gross_profit' }, '2026-09-21').sortBy).toBe('gross_profit');
  });
});

const monthEnvelope = {
  data: {
    month: '2026-09',
    lastSaleDate: '2026-09-19',
    isPartialMonth: true,
    profitStatus: 'partial',
    totals: { salesTaxIn: 1703263, netAfterAmazonFees: 991537, grossProfit: 344507, operatingProfit: 154668, fixedCosts: -189839, units: 1568, returnUnits: 26, adSpend: 86581, adSales: 488151, acosPct: 17.7, productsWithSales: 112 },
    ranking: { products: [{ title: '卓上ベル', asin: 'B0FXTQPGSB', units: 423, salesTaxIn: 311484, grossProfit: 76819, adSpend: 20000 }] },
  },
  meta: { warnings: ['この月のデータは 2026-09-19 までです。'] },
};

describe('summarizeMonth', () => {
  it('carries the caveats with the numbers: a month still in progress, an unconfirmed profit', () => {
    const out = summarizeMonth(monthEnvelope) as Record<string, any>;
    expect(out.月の途中).toBe(true);
    expect(out.データの最終日).toBe('2026-09-19');
    expect(out.利益の状態).toBe('partial');
    expect(out.合計.売上税込).toBe(1703263);
    expect(out.上位).toEqual([{ 商品: '卓上ベル', ASIN: 'B0FXTQPGSB', 販売数: 423, 売上税込: 311484, 売上表示: '31.1万円', 粗利: 76819, 広告費: 20000 }]);
    expect(out.注意).toContain('この月のデータは 2026-09-19 までです。');
  });

  it('leaves a missing number null rather than zero', () => {
    const out = summarizeMonth({ data: { month: '2026-09', totals: {} }, meta: {} }) as Record<string, any>;
    expect(out.合計.粗利).toBeNull();
  });
});

describe('runHaksaiSalesTool', () => {
  it('asks for the month in the calendar of the president when none is named', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mcpReply(monthEnvelope));
    const out = (await runHaksaiSalesTool(env(), { name: 'haksai_sales', args: {} }, '2026-09-21')) as Record<string, any>;
    const sent = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string).params;
    expect(sent).toMatchObject({ name: 'haksai_get_month_summary', arguments: { month: '2026-09', top: 5, sort_by: 'sales' } });
    expect(out.合計.売上税込).toBe(1703263);
  });

  it('passes the reason along when the source has no data for the month', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(mcpReply({ data: null, error: '2020-01 の売上データが、D1にありません。' }));
    const out = (await runHaksaiSalesTool(env(), { name: 'haksai_sales', args: { month: '2020-01' } }, '2026-09-21')) as { error: string };
    expect(out.error).toContain('売上を読めませんでした');
    expect(out.error).toContain('D1にありません');
  });

  it('says a connection failed instead of returning an empty answer', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 302 }));
    expect(await runHaksaiSalesTool(env(), { name: 'haksai_sales', args: {} }, '2026-09-21')).toEqual({
      error: expect.stringContaining('HAKSAI に接続できませんでした'),
    });
  });
});

const adsEnvelope = {
  data: {
    scope: { level: 'account' },
    granularity: 'day',
    totals: { daysWithData: 6, impressions: 90000, clicks: 700, adSpend: 37039, adSales: 210000, orders: 55, units: 60, acos: 0.1764 },
    periods: [{ periodStart: '2026-10-01', adSpend: 6000, adSales: 30000, orders: 8, clicks: 100, impressions: 15000, acos: 0.2, daysWithData: 1 }],
    topProducts: { sortedBy: 'spend', rows: [{ asin: 'B0FXTQPGSB', title: '卓上ベル', adSpend: 12000, adSales: 80000, orders: 20, clicks: 200, acos: 0.15, daysWithData: 6 }] },
    topCampaigns: { sortedBy: 'spend', rows: [{ campaign: 'SP-自動', adSpend: 9000, adSales: 40000, orders: 10, clicks: 150, acos: 0.225, daysAtBudget: 2, daysWithData: 6 }] },
  },
  meta: { period: { from: '2026-10-01', to: '2026-10-06' }, warnings: ['売上・注文は、広告がクリックされてから7日間の値です。'] },
};

describe('readAdsArgs', () => {
  it('means this month so far when no dates are given', () => {
    expect(readAdsArgs({}, '2026-10-07')).toMatchObject({ from: '2026-10-01', to: '2026-10-07', asin: null, top: 5, sortBy: 'spend', granularity: 'day' });
  });
  it('takes one date as one day, or as the start of an open range', () => {
    expect(readAdsArgs({ from: '2026-10-05', to: '2026-10-05' }, '2026-10-07')).toMatchObject({ from: '2026-10-05', to: '2026-10-05' });
    expect(readAdsArgs({ from: '2026-10-05' }, '2026-10-07')).toMatchObject({ from: '2026-10-05', to: '2026-10-07' });
    expect(readAdsArgs({ to: '2026-10-05' }, '2026-10-07')).toMatchObject({ from: '2026-10-05', to: '2026-10-05' });
  });
  it('turns backwards dates round, and drops what is not a date', () => {
    expect(readAdsArgs({ from: '2026-10-06', to: '2026-10-01' }, '2026-10-07')).toMatchObject({ from: '2026-10-01', to: '2026-10-06' });
    expect(readAdsArgs({ from: '昨日', to: 'abc' }, '2026-10-07')).toMatchObject({ from: '2026-10-01', to: '2026-10-07' });
  });
  it('widens the unit with the length of the period', () => {
    expect(readAdsArgs({ from: '2026-09-01', to: '2026-09-30' }, '2026-10-07')).toMatchObject({ granularity: 'week' });
    expect(readAdsArgs({ from: '2026-01-01', to: '2026-09-30' }, '2026-10-07')).toMatchObject({ granularity: 'month' });
  });
  it('reads top and sort_by defensively, and refuses a malformed ASIN instead of answering for every product', () => {
    expect(readAdsArgs({ top: 99, sort_by: 'drop table' }, '2026-10-07')).toMatchObject({ top: 20, sortBy: 'spend' });
    expect(readAdsArgs({ asin: 'b0fxtqpgsb' }, '2026-10-07')).toMatchObject({ asin: 'B0FXTQPGSB' });
    expect(readAdsArgs({ asin: '卓上ベル' }, '2026-10-07')).toHaveProperty('error');
  });
});

describe('summarizeAds', () => {
  it('speaks the yen and the ratios, and names the period', () => {
    const out = summarizeAds(adsEnvelope) as Record<string, any>;
    expect(out.範囲).toBe('全商品の合計');
    expect(out.期間).toEqual({ 開始: '2026-10-01', 終了: '2026-10-06' });
    expect(out.合計.広告費).toBe('3.7万円');
    expect(out.合計.ACOS).toBe('17.6%');
    expect(out.上位の商品[0]).toMatchObject({ 商品: '卓上ベル', ASIN: 'B0FXTQPGSB', 広告費: '1.2万円', ACOS: '15.0%' });
    expect(out.上位のキャンペーン[0]).toMatchObject({ キャンペーン: 'SP-自動', 予算到達日数: 2 });
    expect(out.注意).toContain('売上・注文は、広告がクリックされてから7日間の値です。');
  });
  it('says which product it is when one was asked for, and leaves a missing number null', () => {
    const out = summarizeAds({ data: { scope: { asin: 'B0FXTQPGSB' }, totals: {}, campaigns: [{ campaign: 'A', adSpend: 100 }] }, meta: {} }) as Record<string, any>;
    expect(out.範囲).toBe('商品 B0FXTQPGSB');
    expect(out.合計.ACOS).toBeNull();
    expect(out.紐付くキャンペーン[0].広告費).toBe('100円');
  });
});

describe('runHaksaiAdsTool', () => {
  it('asks the account-level way when no ASIN is given', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mcpReply(adsEnvelope));
    const out = (await runHaksaiAdsTool(env(), { name: 'haksai_ads', args: { from: '2026-10-01', to: '2026-10-06', top: 5 } }, '2026-10-07')) as Record<string, any>;
    const sent = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string).params;
    expect(sent).toMatchObject({ name: 'haksai_get_ad_performance', arguments: { from: '2026-10-01', to: '2026-10-06', granularity: 'day', top: 5, sort_by: 'spend' } });
    expect(sent.arguments).not.toHaveProperty('asin');
    expect(out.合計.広告費).toBe('3.7万円');
  });
  it('passes the ASIN, and not the account-level options, when one is given', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mcpReply({ data: { scope: { asin: 'B0FXTQPGSB' }, totals: {} }, meta: {} }));
    await runHaksaiAdsTool(env(), { name: 'haksai_ads', args: { asin: 'B0FXTQPGSB' } }, '2026-10-07');
    const sent = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string).params;
    expect(sent.arguments).toMatchObject({ asin: 'B0FXTQPGSB' });
    expect(sent.arguments).not.toHaveProperty('top');
  });
  it('tells the model when the source has nothing, and when the ASIN is malformed', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(mcpReply({ data: null, error: '期間が長すぎます。' }));
    const out = (await runHaksaiAdsTool(env(), { name: 'haksai_ads', args: {} }, '2026-10-07')) as { error: string };
    expect(out.error).toContain('広告を読めませんでした');
    expect(out.error).toContain('期間が長すぎます');
    expect(await runHaksaiAdsTool(env(), { name: 'haksai_ads', args: { asin: 'ベル' } }, '2026-10-07')).toEqual({ error: expect.stringContaining('ASIN') });
  });
});

const changesEnvelope = {
  data: {
    count: 2,
    changes: [
      { campaign: '卓上ベル 自動', changeTypeLabel: '日予算', title: '[自動] 日予算を ¥3,000 → ¥4,500', effectiveDate: '2026-10-07', source: 'auto(自動で検知)', beforeValue: 3000, afterValue: 4500, statusLabel: '確定', verdictLabel: '改善', overlappedWithOtherChanges: false, summary: '判定: 改善。',
        before7days: { adSpend: 3500, adSales: 14000, orders: 7, clicks: 70, acos: 0.25, daysWithData: 7 }, after7days: { adSpend: 5000, adSales: 22000, orders: 11, clicks: 90, acos: 0.227, daysWithData: 7 }, asin: 'B0FXTQPGSB' },
      { campaign: 'ハンドベル', changeTypeLabel: '入札・掲載位置・戦略', title: '手で記録', effectiveDate: '2026-10-09', source: 'manual(手で記録)', statusLabel: '測定中(後7日がそろっていません)', verdictLabel: null, overlappedWithOtherChanges: true, summary: null },
    ],
  },
  meta: { period: { from: '2026-09-10', to: '2026-10-10' }, warnings: ['変更の時刻は、最大6時間の誤差があります。'] },
};

describe('広告の変更の道具', () => {
  it('reads the arguments defensively: bad dates are dropped, a bad ASIN is an error, % and _ are stripped from the campaign', () => {
    expect(readAdChangesArgs({ from: '2026-10-01', to: '昨日', campaign: '卓上%ベル_', limit: 999 })).toEqual({ from: '2026-10-01', to: null, campaign: '卓上ベル', asin: null, limit: 50 });
    expect(readAdChangesArgs({ asin: 'ベル' })).toHaveProperty('error');
    expect(readAdChangesArgs({})).toMatchObject({ from: null, to: null, asin: null, limit: 20 });
  });
  it('keeps the state of the measurement next to the verdict, and speaks the yen', () => {
    const out = summarizeAdChanges(changesEnvelope) as Record<string, any>;
    expect(out.件数).toBe(2);
    expect(out.変更[0]).toMatchObject({ 効果測定の状態: '確定', 効果の判定: '改善', 変更前: 3000, 変更後: 4500, 記録の元: 'auto(自動で検知)' });
    expect(out.変更[0].変更の後7日).toMatchObject({ 広告費: '5,000円', 広告経由の売上: '2.2万円', ACOS: '22.7%' });
    expect(out.変更[1]).toMatchObject({ 効果測定の状態: '測定中(後7日がそろっていません)', 効果の判定: null, 他の変更と重なっている: true });
    expect(out.変更[1].変更の前7日).toBeNull();
    expect(out.注意.join('')).toContain('言い切りません');
  });
  it('asks the source with only the dates and filters that were given', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mcpReply(changesEnvelope));
    await runHaksaiAdChangesTool(env(), { name: 'haksai_ad_changes', args: { campaign: '卓上ベル' } });
    const sent = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string).params;
    expect(sent).toMatchObject({ name: 'haksai_get_ad_changes', arguments: { campaign: '卓上ベル', limit: 20 } });
    expect(sent.arguments).not.toHaveProperty('from');
    expect(await runHaksaiAdChangesTool(env(), { name: 'haksai_ad_changes', args: { asin: 'ベル' } })).toEqual({ error: expect.stringContaining('ASIN') });
  });
});

const forecastEnvelope = {
  data: {
    month: '2026-10', dataUntil: '2026-10-06', elapsedDays: 6, remainingDays: 25, daysInMonth: 31,
    actualSoFar: { salesTaxIn: 700000, netAfterAmazonFees: 560000, grossProfit: 224000, adSpend: 70000, operatingProfit: 154000 },
    projectedMonthEnd: {
      salesTaxIn: { mid: 3100000, low: 2900000, high: 3300000 }, netAfterAmazonFees: { mid: 2480000, low: 2300000, high: 2600000 },
      grossProfit: { mid: 992000, low: 900000, high: 1080000 }, adSpend: 310000, operatingProfit: { mid: 682000, low: 590000, high: 770000 },
    },
    expectedSalesPerRemainingDay: 96000,
    target: { salesTaxIn: 3000000, remaining: 2300000, neededPerRemainingDay: 92000, chanceOfReaching: 0.62 },
    summaryLines: ['売上(税込) 約¥3,100,000'],
  },
  meta: { warnings: ['在庫の欠品による取りこぼしは、入っていません。'] },
};

describe('月末の見立ての道具', () => {
  it('reads the optional target defensively', () => {
    expect(readForecastArgs({})).toEqual({ targetSales: null });
    expect(readForecastArgs({ target_sales: 3500000.4 })).toEqual({ targetSales: 3500000 });
    expect(readForecastArgs({ target_sales: -5 })).toEqual({ targetSales: null });
    expect(readForecastArgs({ target_sales: 'たくさん' })).toEqual({ targetSales: null });
  });
  it('speaks the yen once, here, with the band and the chance of reaching the target', () => {
    const out = summarizeForecast(forecastEnvelope) as Record<string, any>;
    expect(out.月末の見込み.売上税込).toEqual({ 見込み: '310.0万円', 下限: '290.0万円', 上限: '330.0万円' });
    expect(out.月末の見込み.営業利益_粗利から広告費を引いた額.見込み).toBe('68.2万円');
    expect(out.売上目標).toEqual({ 目標: '300.0万円', 目標までの残り: '230.0万円', 残りの日の必要な1日の売上: '9.2万円', 届く見込み: '62%' });
    expect(out.残りの日の1日あたりの売上の見込み).toBe('9.6万円');
    expect(out.注意.join('')).toContain('保証ではありません');
  });
  it('asks without a target by default, and reports a source that has no answer', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mcpReply(forecastEnvelope));
    await runHaksaiForecastTool(env(), { name: 'haksai_forecast', args: {} });
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string).params).toMatchObject({ name: 'haksai_get_month_forecast', arguments: {} });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(mcpReply({ data: null, error: '2026-10 の売上データが、D1にありません。' }));
    expect(await runHaksaiForecastTool(env(), { name: 'haksai_forecast', args: {} })).toEqual({ error: expect.stringContaining('月末の見立てを読めませんでした') });
  });
});

describe('refersToAmazon', () => {
  it.each(['パジャマの在庫、発注はどれが急ぎ?', '9月の売上を教えて', '今月の粗利は?', 'ACOSが高い商品は', 'Amazonの売れ筋を知りたい', '欠品しそうなのは?', '卓上ベルの競合が値下げしてる', 'ランキングは動いてる?'])(
    'catches "%s"',
    (message) => {
      expect(refersToAmazon(message)).toBe(true);
    },
  );

  it.each(['おはよう', '今日の晩御飯どうしよう', '前に決めた値上げの話を覚えてる?', '筋トレのメニューを考えて'])(
    'leaves "%s" alone, so an ordinary chat is not made to wait',
    (message) => {
      expect(refersToAmazon(message)).toBe(false);
    },
  );
});

describe('cleanCredential', () => {
  it('drops the header name when the whole line was pasted', () => {
    expect(cleanCredential('CF-Access-Client-Secret: abc123')).toBe('abc123');
    expect(cleanCredential('cf-access-client-id:abc.access')).toBe('abc.access');
  });

  it('leaves a bare value alone, and trims the space a paste brings along', () => {
    expect(cleanCredential('abc.access')).toBe('abc.access');
    expect(cleanCredential('  abc123 ')).toBe('abc123');
  });

  it('is applied to what is sent, so a pasted line still gets through', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mcpReply({ data: {} }));
    await callMcp(
      env({ HAKSAI_MCP_CLIENT_ID: 'CF-Access-Client-Id: id.access', HAKSAI_MCP_CLIENT_SECRET: 'CF-Access-Client-Secret: shh' }),
      'haksai_get_inventory',
      {},
    );
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['CF-Access-Client-Id']).toBe('id.access');
    expect(headers['CF-Access-Client-Secret']).toBe('shh');
  });
});

describe('refusalHint', () => {
  it('points a different way for each kind of refusal', () => {
    expect(refusalHint(302)).toContain('ポリシー');
    expect(refusalHint(401)).toContain('ACCESS_AUD');
    expect(refusalHint(403)).toContain('ACCESS_ALLOWED_CLIENT_IDS');
    expect(refusalHint(503)).toContain('未完了');
    expect(refusalHint(500)).toContain('サービストークン');
  });
});

describe('the tool manual in the app', () => {
  it('names only tools the server really offers, and offers none it does not describe', () => {
    const offered = [HAKSAI_INVENTORY_TOOL.name, HAKSAI_SALES_TOOL.name, HAKSAI_ADS_TOOL.name, HAKSAI_AD_CHANGES_TOOL.name, HAKSAI_FORECAST_TOOL.name, HAKSAI_MARKET_TOOL.name].sort();
    const readyAmazonCards = AMAZON_TOOLS.filter((tool) => tool.serverTools.length > 0);
    expect(readyAmazonCards.flatMap((tool) => tool.serverTools).sort()).toEqual(offered);
    expect(readyAmazonCards).toHaveLength(offered.length);
  });

  it('only suggests questions the server turns into a tool call', () => {
    for (const tool of AMAZON_TOOLS.filter((item) => item.serverTools.length > 0)) {
      for (const question of tool.ask) {
        expect({ question, triggers: refersToAmazon(question) }).toEqual({ question, triggers: true });
      }
    }
  });
});

describe('yenLabel', () => {
  it('turns yen into the way it is said, dividing once here rather than in the model', () => {
    expect(yenLabel(1790028)).toBe('179.0万円');
    expect(yenLabel(364976)).toBe('36.5万円');
    expect(yenLabel(9999)).toBe('9,999円');
    expect(yenLabel(-189839)).toBe('−19.0万円');
  });

  it('says nothing for a number that is not there', () => {
    expect(yenLabel(null)).toBeNull();
    expect(yenLabel('x')).toBeNull();
  });
});

describe('the finished list', () => {
  it('writes each urgent row as a sentence, flagging the ones past their deadline', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.params.name === 'haksai_search_products') {
        return Promise.resolve(mcpReply({ data: { groups: [{ variations: [variation('B0A', 'M', 'A03', 32), variation('B0B', 'L', 'A08', 22)] }] } }));
      }
      return Promise.resolve(mcpReply(inventory('urgent', 1, 26)));
    });
    const result = (await runHaksaiInventoryTool(env(), { name: 'haksai_inventory', args: { query: 'パジャマ' } })) as Record<string, any>;
    expect(result.すぐ発注の一覧).toHaveLength(2);
    expect(result.すぐ発注の一覧[0]).toContain('M A03：在庫1、日販0.35、在庫3日分、発注期限2026-08-24（期限を過ぎています）、推奨26個');
  });

  it('shows the month in spoken yen beside the raw numbers', () => {
    const out = summarizeMonth(monthEnvelope) as Record<string, any>;
    expect(out.表示.売上税込).toBe('170.3万円');
    expect(out.表示.販売数).toBe('1568個');
    expect(out.合計.売上税込).toBe(1703263);
    expect(out.上位[0].売上表示).toBe('31.1万円');
  });
});

describe('the order of the urgent list', () => {
  it('puts the most overdue first, and the merely-due last', async () => {
    const plans: Record<string, { state: string; by: string }> = {
      B0A: { state: 'order', by: '2026-09-26' },
      B0B: { state: 'urgent', by: '2026-09-08' },
      B0C: { state: 'urgent', by: '2026-08-24' },
    };
    jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.params.name === 'haksai_search_products') {
        return Promise.resolve(mcpReply({ data: { groups: [{ variations: [variation('B0A', 'M', 'A08', 3), variation('B0B', 'L', 'A02', 2), variation('B0C', 'M', 'A03', 1)] }] } }));
      }
      const plan = plans[body.params.arguments.asin]!;
      return Promise.resolve(mcpReply({ data: { snapshot: { date: '2026-09-19', rows: [{ available: 1 }] }, plan: { state: plan.state, sellingPacePerDay: 0.2, coverTotalDays: 3, orderBy: plan.by, runoutDate: '2026-10-01', recommendedOrderQty: 5 } }, meta: { warnings: [] } }));
    });
    const result = (await runHaksaiInventoryTool(env(), { name: 'haksai_inventory', args: { query: 'パジャマ' } })) as Record<string, any>;
    expect(result.すぐ発注の一覧.map((line: string) => line.split('：')[0])).toEqual(['M A03', 'L A02', 'M A08']);
  });
});

describe('readMarketArgs', () => {
  it('keeps a plain yen price and drops anything else rather than guessing', () => {
    expect(readMarketArgs({ query: ' 卓上ベル ', new_price: 690 })).toEqual({ query: '卓上ベル', newPrice: 690 });
    expect(readMarketArgs({ query: 'x', new_price: '690円' }).newPrice).toBeNull();
    expect(readMarketArgs({ query: 'x', new_price: -5 }).newPrice).toBeNull();
    expect(readMarketArgs({ query: 'x' }).newPrice).toBeNull();
  });
});

describe('unit profit and the price trial', () => {
  // The bell as measured on 2026-09-20: price 748, landed cost 154, FBA fee 358, referral 4.95%.
  it('works out what one unit leaves, and the rise in sales that holds the profit at a lower price', () => {
    const now = unitProfit(748, 154, 358, 4.95);
    expect(now).toEqual({ 価格: 748, 粗利: 199, 内訳: { FBA手数料: 358, 紹介料: 37, 原価: 154 } });
    const trial = priceTrial(now, unitProfit(690, 154, 358, 4.95)) as Record<string, any>;
    expect(trial.変更後.粗利).toBe(144);
    expect(trial.同じ粗利に必要な販売数の増加百分率).toBe(38);
    expect(trial.判断材料).toContain('38%');
  });

  it('says so when the new price leaves nothing, instead of a percentage', () => {
    const trial = priceTrial(unitProfit(748, 154, 358, 4.95), unitProfit(500, 154, 358, 4.95)) as Record<string, any>;
    expect(trial.変更後.粗利).toBeLessThanOrEqual(0);
    expect(trial.同じ粗利に必要な販売数の増加百分率).toBeUndefined();
    expect(trial.判断材料).toContain('赤字');
  });
});

const stored = (asin: string, latest: number) => ({
  asin,
  stored: true,
  fetchedAt: '2026-09-20T05:58:53.589Z',
  ageDays: 1,
  price: { latestYen: latest, minYen: 690, maxYen: 748, changeCount: 2, changes: [{ date: '2026-09-02', fromYen: 748, toYen: 690 }, { date: '2026-09-10', fromYen: 690, toYen: 740 }] },
  rank: { latest: 205, best: 83, worst: 500, weekly: [{ weekStart: '2026-09-07', avgRank: 205 }] },
});
const marketEnvelope = {
  data: {
    history: stored('B0FXTQPGSB', 748),
    competitor: { asin: 'B07ZV6Y8SY', watching: true, lastCheckedAt: '2026-09-20T05:58:53.622Z', history: stored('B07ZV6Y8SY', 740) },
    recentEvents: [{ kind: 'rank_up', date: '2026-09-13', label: '競合のランキングが上昇（週平均 484位→205位）' }],
  },
  meta: { warnings: [] },
};
const productEnvelope = { data: { master: { currentLandedCostYen: 154 }, keepa: { priceYen: 748, fbaFeeYen: 358, referralPct: 4.95 } }, meta: { warnings: [] } };

describe('summarizeMarket', () => {
  it('puts the two histories, the competitor changes and the trial side by side', () => {
    const out = summarizeMarket(marketEnvelope, productEnvelope, 690) as Record<string, any>;
    expect(out.競合.価格.変更).toEqual(['9/2 748円→690円', '9/10 690円→740円']);
    expect(out.競合.追跡中).toBe(true);
    expect(out.競合の変化[0]).toContain('9/13');
    expect(out['1個あたりの粗利'].同じ粗利に必要な販売数の増加百分率).toBe(38);
  });

  it('says a history is not fetched rather than describing one', () => {
    const out = summarizeMarket({ data: { history: { asin: 'B0X', stored: false }, competitor: null, recentEvents: [] } }, productEnvelope, null) as Record<string, any>;
    expect(out.自社).toEqual({ ASIN: 'B0X', 状態: '未取得' });
    expect(out.競合).toBe('設定されていません');
  });

  it('names what is missing and does not fill a cost that is not there', () => {
    const out = summarizeMarket(marketEnvelope, { data: { master: { currentLandedCostYen: null }, keepa: null } }, 690) as Record<string, any>;
    expect(out['1個あたりの粗利'].試算できません).toContain('原価');
    expect(out['1個あたりの粗利'].試算できません).toContain('FBA手数料');
    expect(out['1個あたりの粗利'].変更後).toBeUndefined();
  });

  it('carries the offering snapshot (offer count, Buy Box holder, out-of-stock rate) when the source has it, and says 未取得 when it does not', () => {
    const withOffering = {
      data: {
        ...marketEnvelope.data,
        competitor: {
          ...marketEnvelope.data.competitor,
          history: {
            ...marketEnvelope.data.competitor.history,
            snapshot: { offerCount: 3, buyBoxIsAmazon: false, buyBoxIsFba: true, outOfStockPct90: 16, monthlySoldAtLeast: 200, salesRankDrops30: 23, salesRankDrops90: 51 },
            offerCount: { latest: 2, min: 1, max: 2, changeCount: 1, changes: [{ date: '2026-09-06', from: 1, to: 2 }] },
          },
        },
      },
      meta: { warnings: [] },
    };
    const out = summarizeMarket(withOffering, productEnvelope, null) as Record<string, any>;
    expect(out.競合.出品状況).toEqual({
      出品者数: 3,
      BuyBoxの持ち主: 'third_party',
      BuyBoxはFBA: true,
      在庫切れ率90日パーセント: 16,
      月販下限: 200,
      出品者数の変化: ['9/6 1→2'],
    });
    expect(out.自社.出品状況).toBe('未取得'); // marketEnvelope の自社側には snapshot を足していない
  });
});

describe('runHaksaiMarketTool', () => {
  it('finds the product by name, then asks for its history and its cost, and passes the price along', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string).params;
      if (body.name === 'haksai_search_products') return Promise.resolve(mcpReply({ data: { groups: [{ variations: [variation('B0FXTQPGSB', '', '', 500)] }] } }));
      return Promise.resolve(mcpReply(body.name === 'haksai_get_market_history' ? marketEnvelope : productEnvelope));
    });
    const out = (await runHaksaiMarketTool(env(), { name: 'haksai_market', args: { query: '卓上ベル', new_price: 690 } })) as Record<string, any>;
    const names = fetchMock.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string).params.name);
    expect(names).toEqual(['haksai_search_products', 'haksai_get_market_history', 'haksai_get_product']);
    expect(out.ASIN).toBe('B0FXTQPGSB');
    expect(out['1個あたりの粗利'].変更後.粗利).toBe(144);
  });

  it('does not search when it is given an ASIN', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const name = JSON.parse((init as RequestInit).body as string).params.name;
      return Promise.resolve(mcpReply(name === 'haksai_get_market_history' ? marketEnvelope : productEnvelope));
    });
    await runHaksaiMarketTool(env(), { name: 'haksai_market', args: { query: 'b0fxtqpgsb' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks for a name when none is given, and says a connection failed rather than answering empty', async () => {
    expect(await runHaksaiMarketTool(env(), { name: 'haksai_market', args: {} })).toEqual({ error: expect.stringContaining('指定してください') });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 302 }));
    expect(await runHaksaiMarketTool(env(), { name: 'haksai_market', args: { query: 'B0FXTQPGSB' } })).toEqual({ error: expect.stringContaining('接続できませんでした') });
  });

  it('redirects to the own product when the found ASIN turns out to be tracked only as somebody else\'s competitor, and says so', async () => {
    const ownHistory = { data: { history: notStored('B0G1LMSDTB'), competitor: { asin: 'B0C1BSN28L', watching: true, lastCheckedAt: null, history: stored('B0C1BSN28L', 1200) }, recentEvents: [] }, meta: { warnings: [] } };
    const rivalHistory = { data: { role: 'competitor_of_own', pairedOwnAsin: 'B0G1LMSDTB', history: stored('B0C1BSN28L', 1200), competitor: null, recentEvents: [] }, meta: { warnings: [] } };
    const ownProduct = { data: { master: { title: 'エアコン 掃除ブラシ 3本セット', currentLandedCostYen: null }, keepa: null }, meta: { warnings: [] } };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string).params;
      if (body.name === 'haksai_search_products') return Promise.resolve(mcpReply({ data: { groups: [{ variations: [variation('B0C1BSN28L', '', '', 0)] }] } }));
      if (body.name === 'haksai_get_market_history') {
        return Promise.resolve(mcpReply(body.arguments.asin === 'B0G1LMSDTB' ? ownHistory : rivalHistory));
      }
      return Promise.resolve(mcpReply(ownProduct));
    });
    const out = (await runHaksaiMarketTool(env(), { name: 'haksai_market', args: { query: 'エアコン掃除ブラシ' } })) as Record<string, any>;
    const calls = fetchMock.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string).params);
    expect(calls.filter((call) => call.name === 'haksai_get_market_history').map((call) => call.arguments.asin)).toEqual(['B0C1BSN28L', 'B0G1LMSDTB']);
    expect(out.ASIN).toBe('B0G1LMSDTB');
    expect(out.商品).toBe('エアコン 掃除ブラシ 3本セット');
    expect(out.注意[0]).toContain('B0C1BSN28L');
    expect(out.注意[0]).toContain('B0G1LMSDTB');
    expect(out.競合.ASIN).toBe('B0C1BSN28L'); // 読み替えた後は、本来の自社×競合のペアが返る
  });
});

const notStored = (asin: string) => ({ data: { history: { asin, stored: false }, competitor: null, recentEvents: [] }, meta: { warnings: [] } });
const keepaEnv = () => env({ HAKSAI_KEEPA_URL: 'https://keepa.example/mcp' });
const fetchReply = (data: unknown, warnings: string[] = []) => mcpReply({ data, meta: { warnings } });

describe('historyNeeds', () => {
  it('asks for a history that is missing or three days old, for the product and its competitor', () => {
    expect(historyNeeds(marketEnvelope)).toEqual([]);
    expect(historyNeeds(notStored('B0X'))).toEqual(['B0X']);
    const old = { data: { history: { ...stored('B0FXTQPGSB', 748), ageDays: 3 }, competitor: { asin: 'B07ZV6Y8SY', history: { asin: 'B07ZV6Y8SY', stored: false } } } };
    expect(historyNeeds(old)).toEqual(['B0FXTQPGSB', 'B07ZV6Y8SY']);
  });
});

describe('keepaFetchConfigured', () => {
  it('needs the address, and uses the read-only token unless a separate one is set', () => {
    expect(keepaFetchConfigured(env())).toBe(false);
    expect(keepaFetchConfigured(keepaEnv())).toBe(true);
    expect(keepaFetchConfigured(env({ HAKSAI_KEEPA_URL: 'https://k', HAKSAI_MCP_CLIENT_ID: undefined }))).toBe(false);
  });
});

describe('runHaksaiMarketTool: fetching what is missing', () => {
  const route = (handlers: Record<string, () => Response>) =>
    jest.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      const name = JSON.parse((init as RequestInit).body as string).params.name;
      const key = name === 'haksai_fetch_keepa' ? 'fetch' : name;
      return Promise.resolve(handlers[key]!());
    });

  it('fetches once when the history is missing, then reads again and reports what it spent', async () => {
    let reads = 0;
    const fetchMock = route({
      haksai_get_market_history: () => mcpReply(reads++ === 0 ? notStored('B0FXTQPGSB') : marketEnvelope),
      fetch: () => fetchReply({ status: 'ok', fetched: ['B0FXTQPGSB'], cached: [], notFound: [], consumed: 4, tokensLeft: 43, dailyUsed: 4, dailyCap: 300 }),
      haksai_get_product: () => mcpReply(productEnvelope),
    });
    const out = (await runHaksaiMarketTool(keepaEnv(), { name: 'haksai_market', args: { query: 'B0FXTQPGSB' } })) as Record<string, any>;
    const calls = fetchMock.mock.calls.map((call) => [call[0], JSON.parse((call[1] as RequestInit).body as string).params.name]);
    expect(calls.map((call) => call[1])).toEqual(['haksai_get_market_history', 'haksai_fetch_keepa', 'haksai_get_market_history', 'haksai_get_product']);
    expect(calls[1]![0]).toBe('https://keepa.example/mcp');
    expect(out.Keepa取得).toMatchObject({ 取得した: ['B0FXTQPGSB'], 使ったトークン: 4, 残りトークン: 43, 今日の使用: '4/300トークン' });
    expect(out.出所).toContain('今回、Keepa から取って保存');
  });

  it('does not fetch when the stored history is fresh', async () => {
    const fetchMock = route({ haksai_get_market_history: () => mcpReply(marketEnvelope), haksai_get_product: () => mcpReply(productEnvelope) });
    const out = (await runHaksaiMarketTool(keepaEnv(), { name: 'haksai_market', args: { query: 'B0FXTQPGSB' } })) as Record<string, any>;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.Keepa取得).toBeNull();
  });

  it('says so, and still answers from what is stored, when the door is not set up', async () => {
    const fetchMock = route({ haksai_get_market_history: () => mcpReply(notStored('B0X0000000')), haksai_get_product: () => mcpReply(productEnvelope) });
    const out = (await runHaksaiMarketTool(env(), { name: 'haksai_market', args: { query: 'B0X0000000' } })) as Record<string, any>;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.自社).toEqual({ ASIN: 'B0X0000000', 状態: '未取得' });
    expect(out.Keepa取得.取れなかった理由).toContain('設定されていません');
  });

  it('passes a refusal along (few tokens, the daily cap) instead of hiding it', async () => {
    route({
      haksai_get_market_history: () => mcpReply(notStored('B0X0000000')),
      fetch: () => fetchReply({ status: 'refused', reason: 'Keepaのトークンの残りが少ないため、取りませんでした（残り20。約4分後に取れます）。', fetched: [], cached: [], notFound: [], consumed: 0, tokensLeft: 20, dailyUsed: 0, dailyCap: 300 }),
      haksai_get_product: () => mcpReply(productEnvelope),
    });
    const out = (await runHaksaiMarketTool(keepaEnv(), { name: 'haksai_market', args: { query: 'B0X0000000' } })) as Record<string, any>;
    expect(out.Keepa取得.取れなかった理由).toContain('残りが少ない');
    expect(out.Keepa取得.取得した).toEqual([]);
    expect(out.自社.状態).toBe('未取得');
  });

  it('keeps answering when the fetch door itself refuses the connection', async () => {
    route({
      haksai_get_market_history: () => mcpReply(notStored('B0X0000000')),
      fetch: () => new Response('', { status: 503 }),
      haksai_get_product: () => mcpReply(productEnvelope),
    });
    const out = (await runHaksaiMarketTool(keepaEnv(), { name: 'haksai_market', args: { query: 'B0X0000000' } })) as Record<string, any>;
    expect(out.Keepa取得.取れなかった理由).toContain('接続できませんでした');
    expect(out.error).toBeUndefined();
  });
});
