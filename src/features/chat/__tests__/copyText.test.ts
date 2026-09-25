import { answerText } from '../MayaAnswer';
import { splitCodeBlocks } from '../copyText';
import type { MayaResponse } from '../mayaResponse';

describe('splitCodeBlocks', () => {
  it('keeps a reply without fences as one text segment', () => {
    expect(splitCodeBlocks('値下げは見送りです。理由は二つあります。')).toEqual([
      { kind: 'text', text: '値下げは見送りです。理由は二つあります。' },
    ]);
  });

  it('separates each fenced block with its language', () => {
    const message = '次の式を使います。\n```sql\nSELECT 1;\n```\n続けてこちら。\n```\n- a\n- b\n```';
    expect(splitCodeBlocks(message)).toEqual([
      { kind: 'text', text: '次の式を使います。' },
      { kind: 'code', language: 'sql', text: 'SELECT 1;' },
      { kind: 'text', text: '続けてこちら。' },
      { kind: 'code', language: '', text: '- a\n- b' },
    ]);
  });

  it('leaves an unclosed fence as prose', () => {
    expect(splitCodeBlocks('途中です。\n```js\nconst a = 1;')).toEqual([
      { kind: 'text', text: '途中です。\n```js\nconst a = 1;' },
    ]);
  });
});

describe('answerText', () => {
  const base: MayaResponse = {
    message: '今は値下げしません。',
    emotion: 'neutral',
    pose: 'default',
    scene: 'work',
    voice: { shouldPlay: false },
  };

  it('is the message alone when nothing else is shown', () => {
    expect(answerText(base)).toBe('今は値下げしません。');
  });

  it('adds options, next action and the question as they read on screen', () => {
    expect(
      answerText({
        ...base,
        options: [
          { label: '据え置く', recommended: true },
          { label: '5%下げる', recommended: false },
        ],
        nextAction: { detected: true, title: '来週の売上を見る' },
        followUpQuestion: '在庫は何日分ありますか？',
      }),
    ).toBe('今は値下げしません。\n\nA. 据え置く（推奨）\nB. 5%下げる\n\nNEXT ACTION: 来週の売上を見る\n\n在庫は何日分ありますか？');
  });
});
