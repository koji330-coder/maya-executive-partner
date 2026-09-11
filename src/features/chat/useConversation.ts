import { useCallback, useEffect, useRef, useState } from 'react';

import type { CharacterRuntime } from '@/features/character';
import type { ApiTier } from '@/services/llm/apiKey';
import { LlmError, type ChatExchange } from '@/services/llm/geminiClient';

import type { MayaResponse } from './mayaResponse';
import { MockResponderError } from './mockResponder';
import { ask } from './responder';
import type { CompanyContext } from './systemPrompt';

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
  source: ApiTier | 'mock';
  /** Set once the user saves the detected decision. */
  decisionSaved?: boolean;
}

export type Turn = UserTurn | MayaTurn;

export interface ConversationState {
  turns: Turn[];
  latest: MayaTurn | null;
  waiting: boolean;
  error: string | null;
  /** Kept so a failed send does not lose what the user typed. */
  draft: string;
}

export interface UseConversationOptions {
  runtime: CharacterRuntime;
  company?: CompanyContext;
  companyIsReal?: boolean;
  /** How many previous turns to send as context. */
  historyDepth?: number;
}

let sequence = 0;
function turnId(prefix: string) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function describe(error: unknown): string {
  if (error instanceof LlmError || error instanceof MockResponderError) {
    return error.message;
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return '送信を取り消しました。';
  }
  return '応答を処理できませんでした。もう一度お試しください。';
}

/**
 * Drives one consultation.
 *
 * The character enters its thinking state before anything async happens, the
 * reply arrives as a validated `MayaResponse`, and its fields — not the prose —
 * move the character and lay out the answer. Whether the answer came from the
 * model or from a script changes nothing here.
 */
export function useConversation({
  runtime,
  company,
  companyIsReal,
  historyDepth = 8,
}: UseConversationOptions) {
  const [state, setState] = useState<ConversationState>({
    turns: [],
    latest: null,
    waiting: false,
    error: null,
    draft: '',
  });

  const waitingRef = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = state.turns;

  useEffect(() => () => abort.current?.abort(), []);

  const setDraft = useCallback((draft: string) => {
    setState((current) => ({ ...current, draft }));
  }, []);

  const send = useCallback(
    async (rawText?: string, scriptId?: string) => {
      const text = (rawText ?? state.draft).trim();
      // docs/ACCEPTANCE_CRITERIA.md: a duplicate send while waiting is prevented.
      if (!text || waitingRef.current) {
        return;
      }

      waitingRef.current = true;
      // Before any await, so the character reacts inside 200ms.
      runtime.beginThinking();

      const userTurn: UserTurn = { id: turnId('user'), role: 'user', text, at: Date.now() };
      setState((current) => ({
        ...current,
        turns: [...current.turns, userTurn],
        waiting: true,
        error: null,
        draft: '',
      }));

      const history: ChatExchange[] = turnsRef.current
        .slice(-historyDepth)
        .map((turn) =>
          turn.role === 'user'
            ? { role: 'user' as const, text: turn.text }
            : { role: 'maya' as const, text: turn.response.message },
        );

      const controller = new AbortController();
      abort.current = controller;

      try {
        const reply = await ask({
          message: text,
          history,
          company,
          companyIsReal,
          scriptId,
          signal: controller.signal,
        });

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
          source: reply.source,
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
          error: describe(error),
          // The typed text comes back so a retry costs nothing.
          draft: text,
        }));
      } finally {
        abort.current = null;
      }
    },
    [company, companyIsReal, historyDepth, runtime, state.draft],
  );

  const cancel = useCallback(() => {
    abort.current?.abort();
  }, []);

  const retry = useCallback(() => {
    const lastUser = [...turnsRef.current]
      .reverse()
      .find((turn): turn is UserTurn => turn.role === 'user');
    if (lastUser) {
      void send(lastUser.text);
    }
  }, [send]);

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

  return { ...state, setDraft, send, cancel, retry, dismissError, saveDecision };
}
