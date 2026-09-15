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
      greeting: 'まだ起きてらっしゃるんですね、社長。',
      prompt: '明日に回せる判断なら、明日にしましょう。今すぐ決めるべきことはありますか？',
      scene: 'late_night',
    };
  }
  if (hour < 11) {
    return {
      greeting: 'おはようございます、社長。',
      prompt: '今日は何を決めます？',
      scene: 'morning',
    };
  }
  if (hour < 17) {
    return {
      greeting: 'お疲れさまです、社長。',
      prompt: '午前中に動いた案件で、判断が止まっているものはありますか？',
      scene: 'work',
    };
  }
  if (hour < 22) {
    return {
      greeting: '社長、今日はいかがでしたか。',
      prompt: '今日決めたことと、決めきれなかったことを整理しましょう。',
      scene: 'strategy',
    };
  }
  return {
    greeting: 'こんばんは、社長。',
    prompt: '疲れているときの決断は、だいたい後で見直すことになりますよ。',
    scene: 'late_night',
  };
}
