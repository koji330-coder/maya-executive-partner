import { formatJournal, parseJournal } from '../journal';

/**
 * The shape a journal entry actually arrives in after being copied out of a
 * chat: `-` became `*`, and each key after a list was pushed under that list.
 * The wording is placeholder; the damage is reproduced exactly.
 */
const MANGLED = `---

journal_version: 1
date: 2026-09-13
topic: "キャラクターから秘書へ"
related_projects:

* "maya-executive-partner"
* "content-engine"
  source_type: conversation
  source: "ChatGPT"
  sensitivity: home
  context:
* "UIが形になってきた。"
* "記憶の設計を検討した。"
  motivation:
* "会話できるだけでは物足りない。"
  decisions:
* "記憶を役割ごとに分ける。"
  user_perspective:
* "活動を全部知っている秘書にしたい。"
  ai_feedback:
  interpretation: "本質は秘書づくりに移りつつある。"
  accepted: null
  reason: ""
  content_angles:
* "欲しかったのは秘書だった"

---

# Notes

別々の話題が一つのテーマにつながった。
`;

describe('parseJournal', () => {
  it('recovers the structure from a chat-mangled entry', () => {
    const { entry, problems } = parseJournal(MANGLED);

    expect(problems).toEqual([]);
    expect(entry.journalVersion).toBe(1);
    expect(entry.date).toBe('2026-09-13');
    expect(entry.topic).toBe('キャラクターから秘書へ');
    // The keys that the chat indented under the list are still top-level keys.
    expect(entry.relatedProjects).toEqual(['maya-executive-partner', 'content-engine']);
    expect(entry.sourceType).toBe('conversation');
    expect(entry.source).toBe('ChatGPT');
    expect(entry.sensitivity).toBe('home');
    expect(entry.context).toEqual(['UIが形になってきた。', '記憶の設計を検討した。']);
    expect(entry.motivation).toEqual(['会話できるだけでは物足りない。']);
    expect(entry.decisions).toEqual(['記憶を役割ごとに分ける。']);
    expect(entry.userPerspective).toEqual(['活動を全部知っている秘書にしたい。']);
    expect(entry.aiInterpretation).toBe('本質は秘書づくりに移りつつある。');
    expect(entry.aiVerdict).toBe('undecided');
    expect(entry.contentAngles).toEqual(['欲しかったのは秘書だった']);
    expect(entry.notes).toBe('別々の話題が一つのテーマにつながった。');
  });

  it('reads well-formed front matter the same way', () => {
    const clean = formatJournal(parseJournal(MANGLED).entry);
    expect(parseJournal(clean)).toEqual(parseJournal(MANGLED));
  });

  it('does not change the wording, only the form', () => {
    const { entry } = parseJournal(MANGLED);
    const joined = [...entry.context, ...entry.motivation, ...entry.decisions].join('');
    expect(joined).toBe('UIが形になってきた。記憶の設計を検討した。会話できるだけでは物足りない。記憶を役割ごとに分ける。');
  });

  it('keeps keys it does not know instead of dropping them', () => {
    const { entry } = parseJournal(`---\ndate: 2026-09-13\ntopic: "x"\nsensitivity: home\ncontext:\n- "a"\nmood:\n- "calm"\n- "tired"\n---`);
    expect(entry.extra).toEqual({ mood: ['calm', 'tired'] });
    expect(formatJournal(entry)).toContain('mood:\n  - "calm"\n  - "tired"');
  });

  it('reads the verdict on the AI interpretation', () => {
    const base = '---\ndate: 2026-09-13\ntopic: "x"\nsensitivity: home\ncontext:\n- "a"\nai_feedback:\n  interpretation: "y"\n';
    expect(parseJournal(`${base}  accepted: true\n---`).entry.aiVerdict).toBe('accepted');
    expect(parseJournal(`${base}  accepted: false\n---`).entry.aiVerdict).toBe('rejected');
  });

  it('points out what is missing without refusing the entry', () => {
    const { entry, problems } = parseJournal('topic: "メモだけ"');
    expect(entry.topic).toBe('メモだけ');
    expect(problems).toEqual(
      expect.arrayContaining([
        'date が YYYY-MM-DD の形ではありません。',
        'sensitivity がありません。',
      ]),
    );
  });

  it('flags a sensitivity value it does not know', () => {
    const { entry, problems } = parseJournal('---\ndate: 2026-09-13\ntopic: "x"\nsensitivity: secret\ncontext:\n- "a"\n---');
    expect(entry.sensitivity).toBeNull();
    expect(problems).toContain('sensitivity「secret」は知らない値です。');
  });
});

describe('formatJournal', () => {
  it('writes `-` markers and quoted strings, the shape the skill meant', () => {
    const text = formatJournal(parseJournal(MANGLED).entry);
    expect(text).toContain('related_projects:\n  - "maya-executive-partner"\n  - "content-engine"');
    expect(text).toContain('source_type: conversation');
    expect(text).toContain('ai_feedback:\n  interpretation: "本質は秘書づくりに移りつつある。"\n  accepted: null');
    expect(text).not.toContain('* "');
    expect(text).toContain('# Notes\n\n別々の話題が一つのテーマにつながった。');
  });
});
