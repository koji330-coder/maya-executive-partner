import type { Env } from '../env';
import {
  callMcp,
  cleanCredential,
  commonTitle,
  DEFAULT_LIMIT,
  haksaiConfigured,
  HaksaiError,
  readInventoryArgs,
  refusalHint,
  refersToAmazon,
  readSalesArgs,
  runHaksaiSalesTool,
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
    expect(out.上位).toEqual([{ 商品: '卓上ベル', ASIN: 'B0FXTQPGSB', 販売数: 423, 売上税込: 311484, 粗利: 76819, 広告費: 20000 }]);
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

describe('refersToAmazon', () => {
  it.each(['パジャマの在庫、発注はどれが急ぎ?', '9月の売上を教えて', '今月の粗利は?', 'ACOSが高い商品は', 'Amazonの売れ筋を知りたい', '欠品しそうなのは?'])(
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
