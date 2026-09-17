import type { MayaScene } from '@/features/character/mayaTypes';

export interface TodayGreeting {
  greeting: string;
  prompt: string;
  scene: MayaScene;
}

/**
 * MAYA's opening line on the Today screen.
 *
 * Phase 1 derives it from the clock only. Once the Company Brain exists
 * (Phase 4) the prompt becomes context-aware; the shape of the return value is
 * meant to survive that change.
 */
export function getTodayGreeting(date: Date = new Date()): TodayGreeting {
  const hour = date.getHours();

  if (hour < 5) {
    return {
      greeting: 'まだ起きてるんですね、Gakky。',
      prompt: '夜更かしのお供をしましょうか。それとも、何か気になってることがあります？',
      scene: 'late_night',
    };
  }
  if (hour < 11) {
    return {
      greeting: 'おはようございます、Gakky。',
      prompt: '今日は何から始めます？',
      scene: 'morning',
    };
  }
  if (hour < 17) {
    return {
      greeting: 'お疲れさまです、Gakky。',
      prompt: '午前中はどうでした？ 話したいことがあれば聞きますよ。',
      scene: 'work',
    };
  }
  if (hour < 22) {
    return {
      greeting: 'Gakky、今日はどんな一日でした？',
      prompt: '進んだこと、引っかかっていること、どっちからでもどうぞ。',
      scene: 'strategy',
    };
  }
  return {
    greeting: 'こんばんは、Gakky。',
    prompt: '大きな決断は明日の朝に回して、今夜はゆるく話しましょうか。',
    scene: 'late_night',
  };
}
