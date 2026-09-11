import { useCallback, useRef, useState } from 'react';

import type { CharacterRuntime } from '@/features/character';

import type { MayaResponse } from './mayaResponse';
import { MockResponderError, respondTo } from './mockResponder';

export interface UserTurn {
  id: string;
  role: 'user';
  text: string;
  at: number;
}

export interface MayaTurn {
  id: string;
  role: 'maya';
  at: number;
  response: MayaResponse;
  /** What the validator had to repair. Shown only in development. */
  warnings: string[];
  /** Set once the user saves the detected decision. */
  decisionSaved?: boolean;
}

export type Turn = UserTurn | MayaTurn;

export interface ConversationState {
  turns: Turn[];
  /** The latest MAYA turn, which the Talk screen shows in full. */
  latest: MayaTurn | null;
  waiting: boolean;
  error: string | null;
  /** Kept so a failed send does not lose what the user typed. */
  draft: string;
}

export interface UseConversationOptions {
  runtime: CharacterRuntime;
  /** Stand-in for network latency. Phase 3 replaces this with a real request. */
  latencyMs?: number;
}

let sequence = 0;
function turnId(prefix: string) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

/**
 * Drives one consultation.
 *
 * The send path is the point of Phase 2: the character enters its thinking state
 * immediately, the reply arrives as a validated `MayaResponse`, and the response
 * fields, not the prose, move the character. Swapping the mock responder for the
 * Phase 3 backend leaves the rest of this untouched.
 */
export function useConversation({ runtime, latencyMs = 900 }: UseConversationOptions) {
  const [state, setState] = useState<ConversationState>({
    turns: [],
    latest: null,
    waiting: false,
    error: null,
    draft: '',
  });

  const waitingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setDraft = useCallback((draft: string) => {
    setState((current) => ({ ...current, draft }));
  }, []);

  const finish = useCallback(
    (scriptId: string | undefined, text: string) => {
      try {
        const reply = respondTo(text, scriptId);
        runtime.applyResponse({
          emotion: reply.response.emotion,
          pose: reply.response.pose,
          scene: reply.response.scene,
        });
        const turn: MayaTurn = {
          id: turnId('maya'),
          role: 'maya',
          at: Date.now(),
          response: reply.response,
          warnings: reply.warnings,
        };
        waitingRef.current = false;
        setState((current) => ({
          ...current,
          turns: [...current.turns, turn],
          latest: turn,
          waiting: false,
          error: null,
        }));
        if (reply.response.voice.shouldPlay && reply.response.voice.fixedClipKey) {
          void runtime.speak(reply.response.voice.fixedClipKey);
        }
      } catch (error) {
        // The character must not be left mid-thought when a send fails.
        runtime.cancelThinking();
        waitingRef.current = false;
        setState((current) => ({
          ...current,
          waiting: false,
          error:
            error instanceof MockResponderError
              ? error.message
              : '応答を処理できませんでした。もう一度お試しください。',
          // The typed text comes back so a retry costs nothing.
          draft: text,
        }));
      }
    },
    [runtime],
  );

  const send = useCallback(
    (rawText?: string, scriptId?: string) => {
      const text = (rawText ?? state.draft).trim();
      // docs/ACCEPTANCE_CRITERIA.md: a duplicate send while waiting is prevented.
      if (!text || waitingRef.current) {
        return;
      }

      waitingRef.current = true;
      // Entered before anything async, so the character reacts inside 200ms.
      runtime.beginThinking();

      const userTurn: UserTurn = { id: turnId('user'), role: 'user', text, at: Date.now() };
      setState((current) => ({
        ...current,
        turns: [...current.turns, userTurn],
        waiting: true,
        error: null,
        draft: '',
      }));

      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => finish(scriptId, text), latencyMs);
    },
    [finish, latencyMs, runtime, state.draft],
  );

  const retry = useCallback(() => {
    const lastUser = [...state.turns].reverse().find((turn): turn is UserTurn => turn.role === 'user');
    if (lastUser) {
      send(lastUser.text);
    }
  }, [send, state.turns]);

  const dismissError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  const saveDecision = useCallback((turnIdToSave: string) => {
    setState((current) => ({
      ...current,
      turns: current.turns.map((turn) =>
        turn.id === turnIdToSave && turn.role === 'maya' ? { ...turn, decisionSaved: true } : turn,
      ),
      latest:
        current.latest && current.latest.id === turnIdToSave
          ? { ...current.latest, decisionSaved: true }
          : current.latest,
    }));
  }, []);

  return { ...state, setDraft, send, retry, dismissError, saveDecision };
}
