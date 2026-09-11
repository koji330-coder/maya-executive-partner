import { formatMayaMessage } from '../conversationRepository';
import type { StoredMessage } from '../conversationRepository';
import type { MayaResponse } from '../mayaResponse';

function mayaMessage(response: MayaResponse | null): StoredMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    role: 'maya',
    text: response?.message ?? '値上げは通ります。',
    emotion: 'serious',
    pose: 'thinking',
    scene: 'work',
    voiceKey: null,
    createdAt: '2026-09-11T09:00:00.000Z',
    response,
  };
}

const full: MayaResponse = {
  message: '値上げは通ります。',
  emotion: 'serious',
  pose: 'thinking',
  scene: 'work',
  voice: { shouldPlay: false },
  options: [
    { label: '一律5%', recommended: true },
    { label: '主要3社だけ' },
  ],
  nextAction: { detected: true, title: '案内文の下書き', dueDate: '2026-09-18' },
  decision: { detected: true, title: '値上げに踏み切る', reason: '粗利率が24%まで落ちたため。' },
  followUpQuestion: '一番怖いのはどの取引先ですか？',
};

describe('formatMayaMessage', () => {
  it('keeps the structured half of a reply', () => {
    const text = formatMayaMessage(mayaMessage(full));
    // The recommended option has to stay distinguishable, or the transcript
    // cannot show what MAYA actually pushed for.
    expect(text).toContain('◎ 一律5%');
    expect(text).toContain('・ 主要3社だけ');
    expect(text).toContain('次の一手: 案内文の下書き（期限 2026-09-18）');
    expect(text).toContain('判断: 値上げに踏み切る');
    expect(text).toContain('理由: 粗利率が24%まで落ちたため。');
    expect(text).toContain('問い返し: 一番怖いのはどの取引先ですか？');
  });

  it('omits sections that were not detected', () => {
    const text = formatMayaMessage(
      mayaMessage({ ...full, options: [], nextAction: { detected: false }, decision: { detected: false }, followUpQuestion: null }),
    );
    expect(text).not.toContain('選択肢');
    expect(text).not.toContain('次の一手');
    expect(text).not.toContain('判断');
  });

  it('falls back to the prose for rows written before the column existed', () => {
    expect(formatMayaMessage(mayaMessage(null))).toBe(
      'MAYA [serious / thinking / work]: 値上げは通ります。',
    );
  });
});
