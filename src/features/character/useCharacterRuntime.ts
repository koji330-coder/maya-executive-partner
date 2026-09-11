import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { getAudioEngine } from '@/services/audio';

import { BlinkController } from './BlinkController';
import { BreathingController } from './BreathingController';
import { CharacterStateMachine } from './CharacterStateMachine';
import { LipSyncController } from './LipSyncController';
import {
  DEFAULT_VISUAL_STATE,
  type EyeState,
  type MayaVisualDirective,
  type MayaVisualState,
  type MouthState,
} from './mayaTypes';

export interface CharacterRuntime {
  visualState: MayaVisualState;
  eye: EyeState;
  mouth: MouthState;
  breathing: BreathingController;
  machine: CharacterStateMachine;
  /** Plays a fixed clip and drives lip sync for its duration. */
  speak: (clipKey: string) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  beginThinking: () => void;
  applyResponse: (directive: MayaVisualDirective) => void;
  cancelThinking: () => void;
}

export interface UseCharacterRuntimeOptions {
  initialState?: Partial<MayaVisualState>;
  /** Pauses micro-animation, e.g. when the stage is off screen. */
  active?: boolean;
}

/**
 * Wires the character controllers to React state.
 *
 * Everything here is lifecycle glue. The behaviour itself lives in the plain
 * controller classes so it stays testable without rendering.
 */
export function useCharacterRuntime(options: UseCharacterRuntimeOptions = {}): CharacterRuntime {
  const { initialState, active = true } = options;

  // The machine is created once; `initialState` is a seed, not a live binding.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const machine = useMemo(() => new CharacterStateMachine(initialState), []);
  const blink = useMemo(() => new BlinkController(), []);
  const breathing = useMemo(() => new BreathingController(), []);
  // The generated artwork has an open mouth and a closed one, with nothing in
  // between, so both thresholds sit at the same amplitude and the controller
  // emits two states. docs/ASSET_PIPELINE.md §4. Restore the gap once a
  // half-open frame exists.
  const lipSync = useMemo(
    () => new LipSyncController({ smallThreshold: 0.18, openThreshold: 0.18 }),
    [],
  );

  // The controllers are external stores: they hold the value and notify on
  // change. Subscribing through useSyncExternalStore keeps React in step with
  // them without syncing state from inside an effect, which can tear.
  const visualState = useSyncExternalStore(
    useCallback((onChange) => machine.subscribe(onChange), [machine]),
    useCallback(() => machine.getState(), [machine]),
  );
  const eye = useSyncExternalStore(
    useCallback((onChange) => blink.subscribe(onChange), [blink]),
    useCallback(() => blink.getEye(), [blink]),
  );
  const mouth = useSyncExternalStore(
    useCallback((onChange) => lipSync.subscribe(onChange), [lipSync]),
    useCallback(() => lipSync.getMouth(), [lipSync]),
  );

  const speakingRef = useRef(false);

  useEffect(() => {
    if (!active) {
      blink.stop();
      breathing.stop();
      return;
    }
    blink.start();
    breathing.start();
    return () => {
      blink.stop();
      breathing.stop();
    };
  }, [active, blink, breathing]);

  useEffect(
    () => () => {
      void getAudioEngine().stop();
      lipSync.stop();
    },
    [lipSync],
  );

  const runtime: CharacterRuntime = {
    visualState,
    eye,
    mouth,
    breathing,
    machine,
    beginThinking: () => machine.beginThinking(),
    applyResponse: (directive) => machine.applyResponse(directive),
    cancelThinking: () => machine.cancelThinking(),
    speak: async (clipKey: string) => {
      const engine = getAudioEngine();
      if (speakingRef.current) {
        await stop(engine, machine, lipSync, speakingRef);
      }
      speakingRef.current = true;
      machine.beginSpeaking();
      lipSync.start();
      try {
        await engine.play(clipKey, {
          onAmplitude: (amplitude) => lipSync.push(amplitude),
          onEnd: () => {
            speakingRef.current = false;
            lipSync.stop();
            machine.endSpeaking();
          },
          onError: () => {
            speakingRef.current = false;
            lipSync.stop();
            machine.endSpeaking();
          },
        });
      } catch {
        speakingRef.current = false;
        lipSync.stop();
        machine.endSpeaking();
      }
    },
    stopSpeaking: () => stop(getAudioEngine(), machine, lipSync, speakingRef),
  };

  return runtime;
}

async function stop(
  engine: ReturnType<typeof getAudioEngine>,
  machine: CharacterStateMachine,
  lipSync: LipSyncController,
  speakingRef: { current: boolean },
): Promise<void> {
  await engine.stop();
  speakingRef.current = false;
  lipSync.stop();
  machine.endSpeaking();
}

export const INITIAL_VISUAL_STATE = DEFAULT_VISUAL_STATE;
