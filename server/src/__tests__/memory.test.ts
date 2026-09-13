import { readDraft } from '../memory/decisions';
import { matchProjects, normalizeName, type Project } from '../memory/projects';

function project(id: string, name: string, aliases: string[] = []): Project {
  return { id, name, status: 'active', description: null, aliases, sources: [], createdAt: '2026-09-13' };
}

const MAYA = project('p1', 'MAYA', ['キャラ動かす', 'AI秘書']);
const FIT = project('p2', 'fit-log', ['筋トレ記録']);
const ALL = [MAYA, FIT];

describe('normalizeName', () => {
  it('ignores case, width and spaces, which change nothing about what was meant', () => {
    expect(normalizeName('ＭＡＹＡ ')).toBe('maya');
    expect(normalizeName('Fit Log')).toBe('fitlog');
  });
});

describe('matchProjects', () => {
  it('finds a project by name regardless of how it was typed', () => {
    expect(matchProjects(ALL, 'maya')).toEqual([MAYA]);
    expect(matchProjects(ALL, 'ＭＡＹＡ')).toEqual([MAYA]);
  });

  it('finds a project from a loose description that contains an alias', () => {
    expect(matchProjects(ALL, 'あのキャラ動かすやつ')).toEqual([MAYA]);
  });

  it('prefers an exact match over a partial one', () => {
    const maya2 = project('p3', 'MAYA2');
    expect(matchProjects([MAYA, maya2], 'maya')).toEqual([MAYA]);
  });

  it('returns nothing for an empty query rather than everything', () => {
    expect(matchProjects(ALL, '   ')).toEqual([]);
  });
});

describe('readDraft', () => {
  it('accepts a draft the app would accept', () => {
    expect(readDraft({ title: '価格を維持', dueDate: '2026-09-30' })).toEqual({
      title: '価格を維持',
      reason: '',
      actionTitle: '',
      dueDate: '2026-09-30',
    });
  });

  it('refuses what the app refuses, with the same rules', () => {
    expect(() => readDraft({ title: '  ' })).toThrow('何を決めたかがありません。');
    expect(() => readDraft({ title: 'x', dueDate: '2026-02-30' })).toThrow('YYYY-MM-DD');
    expect(() => readDraft(null)).toThrow('何を決めたかがありません。');
  });
});
