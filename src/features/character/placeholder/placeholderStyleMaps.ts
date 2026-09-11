import type { EyeState, MayaEmotion, MayaPose, MouthState } from '../mayaTypes';

/**
 * Look-up tables for the placeholder renderer.
 *
 * These exist only until the generated MAYA layers from docs/ASSET_PIPELINE.md
 * are available. They are deliberately data, not branching logic, so swapping in
 * real artwork means replacing the renderer and keeping the same state inputs.
 */

/** Eyelid aperture in points for a fully open eye. */
export const EYE_APERTURE: Record<EyeState, number> = {
  open: 1,
  half: 0.45,
  closed: 0.08,
};

/** Some emotions narrow the eyes even when "open". */
export const EMOTION_EYE_SCALE: Record<MayaEmotion, number> = {
  neutral: 1,
  smile: 0.86,
  thinking: 0.9,
  serious: 0.78,
  challenge: 0.82,
  annoyed: 0.66,
  happy: 0.8,
  concerned: 0.95,
  relaxed: 0.88,
  wink: 1,
};

export interface BrowShape {
  /** Rotation in degrees; positive raises the outer end. */
  angle: number;
  /** Vertical offset in points; negative sits higher on the forehead. */
  offset: number;
}

export const EMOTION_BROWS: Record<MayaEmotion, { left: BrowShape; right: BrowShape }> = {
  neutral: { left: { angle: 0, offset: 0 }, right: { angle: 0, offset: 0 } },
  smile: { left: { angle: -4, offset: -1 }, right: { angle: 4, offset: -1 } },
  thinking: { left: { angle: 8, offset: -2 }, right: { angle: 2, offset: 1 } },
  serious: { left: { angle: 10, offset: 2 }, right: { angle: -10, offset: 2 } },
  challenge: { left: { angle: -2, offset: 2 }, right: { angle: 12, offset: -4 } },
  annoyed: { left: { angle: 14, offset: 3 }, right: { angle: -14, offset: 3 } },
  happy: { left: { angle: -7, offset: -3 }, right: { angle: 7, offset: -3 } },
  concerned: { left: { angle: -11, offset: -1 }, right: { angle: 11, offset: -1 } },
  relaxed: { left: { angle: -2, offset: 0 }, right: { angle: 2, offset: 0 } },
  wink: { left: { angle: -6, offset: -2 }, right: { angle: 6, offset: -3 } },
};

export interface MouthShape {
  width: number;
  height: number;
  /** 1 = corners up (smile), -1 = corners down, 0 = flat. */
  curve: number;
}

/** Resting mouth per emotion, used whenever no audio is playing. */
export const EMOTION_MOUTH: Record<MayaEmotion, MouthShape> = {
  neutral: { width: 0.26, height: 0.05, curve: 0.2 },
  smile: { width: 0.34, height: 0.07, curve: 1 },
  thinking: { width: 0.2, height: 0.05, curve: -0.2 },
  serious: { width: 0.28, height: 0.04, curve: -0.1 },
  challenge: { width: 0.26, height: 0.06, curve: 0.5 },
  annoyed: { width: 0.22, height: 0.04, curve: -0.7 },
  happy: { width: 0.38, height: 0.1, curve: 1 },
  concerned: { width: 0.24, height: 0.05, curve: -0.5 },
  relaxed: { width: 0.3, height: 0.06, curve: 0.6 },
  wink: { width: 0.32, height: 0.08, curve: 1 },
};

/** Lip sync overrides the resting mouth while a clip plays. */
export const MOUTH_OPENNESS: Record<MouthState, number> = {
  closed: 0,
  small: 0.45,
  open: 1,
};

export interface PoseTransform {
  /** Horizontal shift as a fraction of stage width. */
  shiftX: number;
  /** Extra scale applied to the whole character group. */
  scale: number;
  /** Body rotation in degrees. */
  tilt: number;
  /** Head tilt in degrees, applied on top of the body rotation. */
  headTilt: number;
}

export const POSE_TRANSFORMS: Record<MayaPose, PoseTransform> = {
  default: { shiftX: 0, scale: 1, tilt: 0, headTilt: 0 },
  thinking: { shiftX: -0.03, scale: 1, tilt: -1.5, headTilt: -5 },
  arms_crossed: { shiftX: 0, scale: 0.98, tilt: 0, headTilt: 2 },
  lean_forward: { shiftX: 0, scale: 1.07, tilt: 0, headTilt: -2 },
  coffee: { shiftX: 0.04, scale: 0.99, tilt: 1, headTilt: 3 },
  tablet: { shiftX: -0.02, scale: 0.99, tilt: -1, headTilt: 4 },
  relaxed: { shiftX: 0.02, scale: 0.97, tilt: 2, headTilt: 5 },
};
