import { presidentDate, presidentNow } from '../clock';

// 2026-09-13 21:47 in Tokyo, which is 12:47 UTC.
const DINNER = Date.UTC(2026, 8, 13, 12, 47);

describe('presidentNow', () => {
  it('shifts by nine hours on a UTC runtime, as on Cloudflare', () => {
    const shifted = presidentNow(DINNER, 0);
    // A UTC runtime reads local fields as UTC, so these must show Tokyo time.
    expect(shifted.getUTCHours()).toBe(21);
    expect(shifted.getUTCMinutes()).toBe(47);
  });

  it('does not shift at all on a runtime already in Tokyo, as in local development', () => {
    // The bug: assuming UTC here added nine hours and MAYA said it was 7am.
    expect(presidentNow(DINNER, 9 * 60).getTime()).toBe(DINNER);
  });

  it('shifts by the difference on any other runtime', () => {
    // A runtime at UTC-5 is fourteen hours behind Tokyo.
    expect(presidentNow(DINNER, -5 * 60).getTime()).toBe(DINNER + 14 * 60 * 60 * 1000);
  });
});

describe('presidentDate', () => {
  it('is the Tokyo date, not the UTC date', () => {
    // 23:30 UTC on the 13th is already 08:30 on the 14th in Tokyo.
    expect(presidentDate(Date.UTC(2026, 8, 13, 23, 30))).toBe('2026-09-14');
    expect(presidentDate(DINNER)).toBe('2026-09-13');
  });
});
