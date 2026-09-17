import type { MayaScene } from './mayaTypes';

/**
 * Background plates.
 *
 * `docs/MAYA_CHARACTER_BIBLE.md` §6 asks for one consistent room rather than a
 * cut-out floating in a chat app. The five plates are the same room at
 * different hours, not five different places, so switching scenes should read
 * as time passing and never as teleporting.
 *
 * A plate carries no character: the runtime treats emotion, pose and scene as
 * independent axes, and baking one into the other would turn them into a cross
 * product (`assets/maya/README.md`).
 */
const PLATES: Partial<Record<MayaScene, number>> = {
  work: require('../../../assets/maya/scenes/scene_work.webp'),
};

export function hasScenePlate(scene: MayaScene): boolean {
  return PLATES[scene] !== undefined;
}

export function scenesWithPlates(): MayaScene[] {
  return Object.keys(PLATES) as MayaScene[];
}

/**
 * The plate for a scene, or null when it has not been drawn yet.
 *
 * Null rather than a substitute plate. Standing MAYA in the daytime office at
 * midnight would contradict what she just said about the hour, and the painted
 * gradient underneath is a truthful "no room yet" instead of the wrong room.
 */
export function resolveScenePlate(scene: MayaScene): number | null {
  return PLATES[scene] ?? null;
}
