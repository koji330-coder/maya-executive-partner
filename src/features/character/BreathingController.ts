import { Animated, Easing } from 'react-native';

export interface BreathingControllerOptions {
  /** One full inhale + exhale. docs/TECH_ARCHITECTURE.md §5 suggests 3–4s. */
  breathCycleMs?: number;
  /** Slow idle drift, intentionally out of phase with the breath. */
  swayCycleMs?: number;
}

const DEFAULT_BREATH_CYCLE_MS = 3600;
const DEFAULT_SWAY_CYCLE_MS = 7400;

/**
 * Always-on micro-motion: a subtle breath plus a much slower idle drift.
 *
 * Both are exposed as 0→1→0 Animated values rather than concrete transforms so
 * the renderer decides how much each layer moves. MAYA must feel present, not
 * restless, so callers should keep the resulting amplitudes very small.
 */
export class BreathingController {
  /** 0 = fully exhaled, 1 = fully inhaled. */
  readonly breath = new Animated.Value(0);

  /** 0 → 1 → 0 drift used for tiny head/upper-body motion. */
  readonly idleSway = new Animated.Value(0);

  private readonly breathCycleMs: number;

  private readonly swayCycleMs: number;

  private animations: Animated.CompositeAnimation[] = [];

  constructor(options: BreathingControllerOptions = {}) {
    this.breathCycleMs = options.breathCycleMs ?? DEFAULT_BREATH_CYCLE_MS;
    this.swayCycleMs = options.swayCycleMs ?? DEFAULT_SWAY_CYCLE_MS;
  }

  isRunning(): boolean {
    return this.animations.length > 0;
  }

  start(): void {
    if (this.isRunning()) {
      return;
    }
    this.animations = [
      makeLoop(this.breath, this.breathCycleMs),
      makeLoop(this.idleSway, this.swayCycleMs),
    ];
    for (const animation of this.animations) {
      animation.start();
    }
  }

  stop(): void {
    for (const animation of this.animations) {
      animation.stop();
    }
    this.animations = [];
    this.breath.setValue(0);
    this.idleSway.setValue(0);
  }
}

function makeLoop(value: Animated.Value, cycleMs: number): Animated.CompositeAnimation {
  const half = Math.max(1, Math.round(cycleMs / 2));
  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, {
        toValue: 1,
        duration: half,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration: half,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]),
  );
}
