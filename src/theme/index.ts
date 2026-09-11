import type { MayaScene } from '@/features/character/mayaTypes';

/**
 * docs/MAYA_CHARACTER_BIBLE.md §6: cream, ivory, charcoal, muted gold.
 * No blue-purple "AI" palette anywhere in the app.
 */
export const colors = {
  cream: '#F6F1E9',
  ivory: '#FDFBF7',
  sand: '#E8DFD2',
  charcoal: '#2B2723',
  charcoalSoft: '#4A443D',
  muted: '#8C8175',
  gold: '#B08D4F',
  goldSoft: '#D9C29A',
  line: '#E2D9CC',
  danger: '#B4553F',
  success: '#5E7C58',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 24, fontWeight: '600' },
  heading: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '500' },
} as const;

export interface SceneTheme {
  backgroundTop: string;
  backgroundBottom: string;
  accent: string;
  label: string;
}

/** Each scene is a light shift of the same room, not a different world. */
export const sceneThemes: Record<MayaScene, SceneTheme> = {
  morning: {
    backgroundTop: '#FBF4E7',
    backgroundBottom: '#EFE3D0',
    accent: '#D9B978',
    label: '朝',
  },
  work: {
    backgroundTop: '#F6F1E9',
    backgroundBottom: '#E7DCCB',
    accent: '#C2A472',
    label: '執務',
  },
  strategy: {
    backgroundTop: '#EDE6DC',
    backgroundBottom: '#D8CCBB',
    accent: '#A98A55',
    label: '戦略',
  },
  casual: {
    backgroundTop: '#F7F0E6',
    backgroundBottom: '#E9DCCA',
    accent: '#CBAE82',
    label: 'カジュアル',
  },
  late_night: {
    backgroundTop: '#3A342E',
    backgroundBottom: '#241F1B',
    accent: '#C6A469',
    label: '深夜',
  },
};

export function isDarkScene(scene: MayaScene): boolean {
  return scene === 'late_night';
}
