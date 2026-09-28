import { formatRouteDetail, formatRouteSummary, parseRouteInfo } from '../routeInfo';

const route = {
  mode: 'assist',
  route: 'direct_prefetch',
  jev: {
    required: 'fitlog_day',
    confidence: 0.97,
    period: 'yesterday',
    useful: 'none',
    usefulConfidence: 0.4,
    contextSufficient: 0.1,
    latencyMs: 312,
    inputTokens: 3900,
  },
  prefetched: ['fitlog_day'],
  offered: [],
  toolsCalled: [],
  rounds: 1,
  latencyMs: 3940,
  promptTokens: 4300,
  outputTokens: 250,
  thoughtsTokens: 400,
};

describe('route info', () => {
  it('reads what the server sends', () => {
    expect(parseRouteInfo(route)).toMatchObject({ route: 'direct_prefetch', jev: { required: 'fitlog_day' }, rounds: 1 });
  });

  it('ignores anything it does not recognise', () => {
    expect(parseRouteInfo(null)).toBeNull();
    expect(parseRouteInfo({ route: 'teleport' })).toBeNull();
  });

  it('says in one line what happened', () => {
    expect(formatRouteSummary(parseRouteInfo(route)!)).toBe('先読み / Jev fitlog_day 97% / fitlog_day / 1往復 / 3.9秒');
  });

  it('spells out the detail, including what Jev said but was not used', () => {
    const detail = formatRouteDetail(parseRouteInfo(route)!).join('\n');
    expect(detail).toContain('期間 yesterday');
    expect(detail).toContain('経路には未使用');
    expect(detail).toContain('Gemini に見せた道具: なし');
  });

  it('shows a fallback and why', () => {
    const summary = formatRouteSummary(
      parseRouteInfo({ ...route, route: 'legacy_fallback', jev: undefined, jevError: 'timeout', prefetched: [], toolsCalled: ['fitlog_day'], rounds: 2 })!,
    );
    expect(summary).toBe('従来（Jev 不通） / fitlog_day / 2往復 / 3.9秒');
  });
});
