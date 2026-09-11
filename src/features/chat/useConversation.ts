import { useCallback, useEffect, useRef, useState } from 'react';

import type { CharacterRuntime } from '@/features/character';
import type { ApiTier } from '@/services/llm/apiKey';
import { LlmError, type ChatExchange } from '@/services/llm/geminiClient';

import {
  createConversation,
  listConversations,
  loadMessages,
  saveMayaMessage,
  saveUserMessage,
} from './conversationRepository';
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
  // One conversation per app session. Phase 5 can let the user pick an older one.
  const conversationId = useRef(`conv-${Date.now()}`);
  const started = useRef(false);
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = state.turns;

  useEffect(() => () => abort.current?.abort(), []);

  // Reopen the most recent conversation so closing the app does not lose it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const recent = await listConversations(1);
      const latest = recent[0];
      if (!latest || cancelled) {
        return;
      }
      const messages = await loadMessages(latest.id);
      if (cancelled || messages.length === 0) {
        return;
      }
      conversationId.current = latest.id;
      started.current = true;
      const turns: Turn[] = messages.map((message) =>
        message.role === 'user'
          ? { id: message.id, role: 'user', text: message.text, at: Date.parse(message.createdAt) }
          : {
              id: message.id,
              role: 'maya',
              at: Date.parse(message.createdAt),
              // Only what was stored. The reply is shown again, not replayed.
              response: {
                message: message.text,
                emotion: (message.emotion ?? 'neutral') as MayaResponse['emotion'],
                pose: (message.pose ?? 'default') as MayaResponse['pose'],
                scene: (message.scene ?? 'work') as MayaResponse['scene'],
                voice: { shouldPlay: false },
              },
              warnings: [],
              source: 'mock',
            },
      );
      const lastMaya = [...turns].reverse().find((turn): turn is MayaTurn => turn.role === 'maya');
      setState((current) => ({ ...current, turns, latest: lastMaya ?? null }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (!started.current) {
        started.current = true;
        // The opening question names the conversation; it is what it was about.
        void createConversation(conversationId.current, text.slice(0, 40));
      }
      void saveUserMessage(conversationId.current, userTurn.id, text);
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
        void saveMayaMessage(conversationId.current, turn.id, reply.response);
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
        const cancelled = error instanceof Error && error.name === 'AbortError';
        setState((current) => ({
          ...current,
          waiting: false,
          // A cancel was the user's own doing, so it is not reported as a fault.
          error: cancelled ? null : describe(error),
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
