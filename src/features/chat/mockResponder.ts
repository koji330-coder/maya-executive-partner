import { validateMayaResponse, type MayaResponse } from './mayaResponse';

/**
 * Scripted replies that stand in for the backend until Phase 3.
 *
 * They are written as untrusted payloads and pushed through the same validator
 * the real model will use, so the path the app exercises now is the path it
 * keeps later. The set deliberately covers the states that are awkward or
 * expensive to provoke from a live model: a flat refusal, a detected decision,
 * a repair the validator has to make, and an outright failure.
 */
export interface MockScript {
  id: string;
  label: string;
  /** Matched against the user's message, lowercased. */
  match: RegExp | null;
  payload: unknown;
  /** Simulates a backend that failed rather than replied. */
  failure?: string;
}

/**
 * Order matters: the first match wins. Intent comes before topic, so "値下げは
 * やめると決めた" is read as a decision rather than as another pricing question.
 */
export const MOCK_SCRIPTS: MockScript[] = [
  {
    id: 'decision-saved',
    label: '判断として検出される',
    match: /決めた|やめる|やることにし|決定/,
    payload: {
      message:
        'わかりました。ではそれを判断として残します。理由も一緒に書いておくと、3か月後に見直すときに効きます。',
      emotion: 'smile',
      pose: 'default',
      scene: 'work',
      voice: { shouldPlay: false },
      decision: {
        detected: true,
        title: '競合の値下げには追随しない',
        reason: '粗利率が3.2ポイント落ちる。まず2週間、CVRの変化を見る。',
      },
      nextAction: { detected: true, title: '2週間後にCVRを確認する', dueDate: null },
      followUpQuestion: null,
    },
  },
  {
    id: 'price-cut',
    label: '値下げに反対する',
    match: /値下げ|価格|安く|競合/,
    payload: {
      message:
        '社長、その値下げは私は反対です。競合に合わせる前に、粗利とCVRへの影響を分けて見ましょう。いま下げると、戻すときに理由を説明できなくなります。',
      summary: '値下げには反対。まず粗利とCVRを分けて試算する。',
      emotion: 'challenge',
      pose: 'lean_forward',
      scene: 'strategy',
      voice: { shouldPlay: true, fixedClipKey: 'strong_disagree_01', style: 'calm_serious' },
      options: [
        { label: '追随して同額まで下げる' },
        { label: '価格は据え置き、特典で差をつける' },
        { label: '2週間だけ様子を見て数字で判断する', recommended: true },
      ],
      decision: { detected: false },
      nextAction: { detected: true, title: '値下げ前後の粗利・CVR影響を試算する', dueDate: null },
      followUpQuestion: '現在の粗利率と、競合との差額はいくらですか？',
    },
  },
  {
    id: 'hiring',
    label: '採用の判断を詰める',
    match: /採用|人を増や|求人|人手/,
    payload: {
      message:
        '増やす前に、いまの遅れが人手不足なのか段取りなのかを分けましょう。人を足して解決しない種類だと、来月も同じ話になります。',
      summary: '採用の前に、遅れの原因を人手と段取りに分ける。',
      emotion: 'serious',
      pose: 'arms_crossed',
      scene: 'work',
      voice: { shouldPlay: false },
      options: [
        { label: 'いますぐ1名採用する' },
        { label: '3か月だけ業務委託で埋める' },
        { label: '2週間、工程ごとの滞留時間を測ってから決める', recommended: true },
      ],
      decision: { detected: false },
      nextAction: { detected: true, title: '工程ごとの滞留時間を2週間計測する', dueDate: null },
      followUpQuestion: '遅れが出ているのは、どの工程ですか？',
    },
  },
  {
    id: 'repeated',
    label: '同じ話を繰り返したとき',
    match: /また|やっぱり|もう一度|先月/,
    payload: {
      message:
        '……社長。それ、先月も同じ結論で止まっていますよ。前提が変わっていないなら、今日も同じところで止まります。',
      emotion: 'annoyed',
      pose: 'default',
      scene: 'work',
      voice: { shouldPlay: false },
      decision: { detected: false },
      nextAction: { detected: false },
      followUpQuestion: '前回から変わった事実は何ですか？',
    },
  },
  {
    id: 'malformed',
    label: '契約から外れた応答（検証で修復）',
    match: /テスト|壊れ|不正/,
    payload: {
      message: '検証の確認用です。表情の値が契約にないものになっています。',
      emotion: 'sarcastic',
      pose: 'floating',
      scene: 'space',
      voice: { shouldPlay: true },
      options: [{ label: '一つ目' }, { label: '二つ目' }],
    },
  },
  {
    id: 'failure',
    label: '応答が返らない',
    match: /失敗|エラー|落ちる/,
    payload: null,
    failure: '応答を受け取れませんでした。通信を確認して、もう一度お試しください。',
  },
  {
    id: 'default',
    label: '一般の相談',
    match: null,
    payload: {
      message:
        'その話、決めるべきことは何でしょうか。いまの言い方だと、選択肢が2つあるのか、もう決めていて背中を押してほしいのかが分かりません。',
      emotion: 'thinking',
      pose: 'thinking',
      scene: 'work',
      voice: { shouldPlay: false },
      decision: { detected: false },
      nextAction: { detected: false },
      followUpQuestion: 'これは何を決める話ですか？',
    },
  },
];

export interface MockReply {
  scriptId: string;
  response: MayaResponse;
  warnings: string[];
}

export class MockResponderError extends Error {}

export function pickScript(userMessage: string): MockScript {
  const text = userMessage.toLowerCase();
  for (const script of MOCK_SCRIPTS) {
    if (script.match && script.match.test(text)) {
      return script;
    }
  }
  return MOCK_SCRIPTS[MOCK_SCRIPTS.length - 1]!;
}

/**
 * Returns the scripted reply for a message, after the same validation the real
 * backend's output will get.
 */
export function respondTo(userMessage: string, scriptId?: string): MockReply {
  const script = scriptId
    ? (MOCK_SCRIPTS.find((candidate) => candidate.id === scriptId) ?? pickScript(userMessage))
    : pickScript(userMessage);

  if (script.failure) {
    throw new MockResponderError(script.failure);
  }

  const result = validateMayaResponse(script.payload);
  if (!result.ok) {
    throw new MockResponderError(
      `応答が契約を満たしていません。${result.errors.join(' ')}`,
    );
  }
  return { scriptId: script.id, response: result.value, warnings: result.warnings };
}
