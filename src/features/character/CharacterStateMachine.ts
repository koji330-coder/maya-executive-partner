import {
  DEFAULT_VISUAL_STATE,
  type MayaActivity,
  type MayaEmotion,
  type MayaPose,
  type MayaScene,
  type MayaVisualDirective,
  type MayaVisualState,
  type Unsubscribe,
} from './mayaTypes';

type Listener = (state: MayaVisualState) => void;

/**
 * Owns MAYA's high-level visual state.
 *
 * It is deliberately free of React, timers and rendering so that chat logic can
 * drive it and tests can assert transitions synchronously. Micro-animation
 * (blink, breathing, lip sync) lives in its own controllers and is not part of
 * this state.
 */
export class CharacterStateMachine {
  private state: MayaVisualState;

  private readonly listeners = new Set<Listener>();

  /** Emotion to fall back to once a thinking pass ends without a directive. */
  private emotionBeforeThinking: MayaEmotion = DEFAULT_VISUAL_STATE.emotion;

  constructor(initial: Partial<MayaVisualState> = {}) {
    this.state = { ...DEFAULT_VISUAL_STATE, ...initial };
  }

  getState(): MayaVisualState {
    return this.state;
  }

  subscribe(listener: Listener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Resting presence: MAYA is on screen and attentive but not engaged. */
  setIdle(): void {
    this.patch({ activity: 'idle', isSpeaking: false });
  }

  /** The user is composing or recording. MAYA leans in slightly. */
  setListening(): void {
    this.patch({ activity: 'listening', isSpeaking: false });
  }

  /**
   * Entered the moment a message is sent, before any network round trip.
   * docs/ACCEPTANCE_CRITERIA.md requires this within 200ms of the send action,
   * so it must never wait on a response.
   */
  beginThinking(): void {
    if (this.state.activity !== 'thinking') {
      this.emotionBeforeThinking = this.state.emotion;
    }
    this.patch({
      activity: 'thinking',
      emotion: 'thinking',
      pose: 'thinking',
      isSpeaking: false,
    });
  }

  /**
   * Applies the visual part of a structured backend response.
   * Activity returns to idle; `beginSpeaking` is a separate, explicit step so
   * that text-only responses never enter the speaking state.
   */
  applyResponse(directive: MayaVisualDirective): void {
    this.patch({
      activity: 'idle',
      emotion: directive.emotion,
      pose: directive.pose ?? 'default',
      scene: directive.scene ?? this.state.scene,
      isSpeaking: false,
    });
  }

  /** Abandons a thinking pass (request failed or was cancelled). */
  cancelThinking(): void {
    if (this.state.activity !== 'thinking') {
      return;
    }
    this.patch({
      activity: 'idle',
      emotion: this.emotionBeforeThinking,
      pose: 'default',
      isSpeaking: false,
    });
  }

  beginSpeaking(): void {
    this.patch({ activity: 'speaking', isSpeaking: true });
  }

  /** Audio finished or was stopped. The mouth is reset by the lip sync controller. */
  endSpeaking(): void {
    if (!this.state.isSpeaking) {
      return;
    }
    this.patch({ activity: 'idle', isSpeaking: false });
  }

  setEmotion(emotion: MayaEmotion): void {
    this.patch({ emotion });
  }

  setPose(pose: MayaPose): void {
    this.patch({ pose });
  }

  setScene(scene: MayaScene): void {
    this.patch({ scene });
  }

  setActivity(activity: MayaActivity): void {
    switch (activity) {
      case 'idle':
        this.setIdle();
        return;
      case 'listening':
        this.setListening();
        return;
      case 'thinking':
        this.beginThinking();
        return;
      case 'speaking':
        this.beginSpeaking();
        return;
    }
  }

  private patch(next: Partial<MayaVisualState>): void {
    const merged: MayaVisualState = { ...this.state, ...next };
    if (
      merged.emotion === this.state.emotion &&
      merged.activity === this.state.activity &&
      merged.pose === this.state.pose &&
      merged.scene === this.state.scene &&
      merged.isSpeaking === this.state.isSpeaking
    ) {
      return;
    }
    this.state = merged;
    for (const listener of this.listeners) {
      listener(merged);
    }
  }
}
