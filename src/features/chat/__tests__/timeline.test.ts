import { buildSystemPrompt, formatTime } from '../systemPrompt';
import { formatNow, formatStamp, GAP_MS, needsStamp, stampHistory } from '../timeline';

// Local-time constructors, so the assertions hold in any time zone.
const at = (month: number, day: number, hour: number, minute = 0) =>
  new Date(2026, month - 1, day, hour, minute).getTime();

describe('formatStamp', () => {
  it('reads as a Japanese date with weekday and time', () => {
    expect(formatStamp(at(9, 12, 21, 40))).toBe('9月12日(土) 21:40');
    expect(formatStamp(at(9, 13, 8, 5))).toBe('9月13日(日) 08:05');
  });

  it('adds the year only for now', () => {
    expect(formatNow(new Date(at(9, 13, 8, 5)))).toBe('2026年9月13日(日) 08:05');
  });
});

describe('needsStamp', () => {
  it('stamps the first message, which has nothing to be measured against', () => {
    expect(needsStamp(at(9, 12, 21), null)).toBe(true);
  });

  it('leaves an ordinary back-and-forth unmarked', () => {
    expect(needsStamp(at(9, 12, 21, 10), at(9, 12, 21, 0))).toBe(false);
    expect(needsStamp(at(9, 12, 21) + GAP_MS - 1, at(9, 12, 21))).toBe(false);
  });

  it('marks a long pause within the same day', () => {
    expect(needsStamp(at(9, 12, 13), at(9, 12, 9))).toBe(true);
  });

  it('marks a new day even after a short gap', () => {
    // 23:50 to 00:10 is twenty minutes, but "yesterday" is still yesterday.
    expect(needsStamp(at(9, 13, 0, 10), at(9, 12, 23, 50))).toBe(true);
  });
});

describe('stampHistory', () => {
  it('stamps only where time passed and keeps the order', () => {
    const history = stampHistory([
      { role: 'user', text: 'しゃぶ葉行ってきた', at: at(9, 11, 22, 0) },
      { role: 'maya', text: '結局しゃぶ葉ですか', at: at(9, 11, 22, 1) },
      { role: 'user', text: 'おはようございます', at: at(9, 12, 8, 0) },
    ]);
    expect(history.map((entry) => entry.text)).toEqual([
      '〔9月11日(金) 22:00〕しゃぶ葉行ってきた',
      '結局しゃぶ葉ですか',
      '〔9月12日(土) 08:00〕おはようございます',
    ]);
  });
});

describe('formatTime', () => {
  it('tells her what now is and how to read the stamps', () => {
    const text = formatTime(new Date(at(9, 13, 8, 5)));
    expect(text).toContain('いまは 2026年9月13日(日) 08:05 です');
    expect(text).toContain('前の日の発言を「さっき」と呼ばないでください');
    expect(text).toContain('〔日時〕を返答に書き写さないでください');
  });

  it('is part of every system prompt', () => {
    expect(buildSystemPrompt(undefined, [], new Date(at(9, 13, 8)))).toContain('いまは 2026年9月13日');
  });
});
