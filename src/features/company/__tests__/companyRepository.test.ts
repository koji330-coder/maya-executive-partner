import { EMPTY_PROFILE, hasProfile, toCompanyContext } from '../companyRepository';

const filled = {
  ...EMPTY_PROFILE,
  name: 'サンプル精機',
  industry: '金属加工の受託製造',
  employeeCount: '28',
  revenueRange: '4〜5億円',
  goals: ['主要取引先への依存を4割まで下げる', ''],
  issues: ['見積作成が属人化していて回答まで平均3日'],
};

describe('company profile', () => {
  it('treats an untouched profile as empty', () => {
    expect(hasProfile(EMPTY_PROFILE)).toBe(false);
    expect(toCompanyContext(EMPTY_PROFILE)).toBeUndefined();
  });

  it('does not count blank list lines as content', () => {
    expect(hasProfile({ ...EMPTY_PROFILE, goals: ['', '  '] })).toBe(false);
  });

  it('counts a single filled field', () => {
    expect(hasProfile({ ...EMPTY_PROFILE, industry: '製造' })).toBe(true);
  });

  it('builds the prompt context from filled fields only', () => {
    const context = toCompanyContext(filled);
    expect(context).toEqual({
      name: 'サンプル精機',
      industry: '金属加工の受託製造',
      employeeCount: 28,
      revenueRange: '4〜5億円',
      goals: ['主要取引先への依存を4割まで下げる'],
      issues: ['見積作成が属人化していて回答まで平均3日'],
    });
  });

  it('leaves out an employee count that is not a number', () => {
    const context = toCompanyContext({ ...filled, employeeCount: '未定' });
    expect(context).not.toHaveProperty('employeeCount');
  });

  it('keeps the description out when it is blank', () => {
    expect(toCompanyContext(filled)).not.toHaveProperty('description');
  });
});
