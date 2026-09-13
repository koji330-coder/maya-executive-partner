import { useCallback, useEffect, useRef, useState } from 'react';

import type { CharacterRuntime } from '@/features/character';
import {
  loadDecisionsForPrompt,
  saveDecision as storeDecision,
  savedSourceMessages,
} from '@/features/decisions/decisionRepository';
import type { DecisionDraft } from '@/features/decisions/types';
import type { ApiTier } from '@/services/llm/apiKey';
import { LlmError, type ChatExchange } from '@/services/llm/geminiClient';

import type { Attachment } from './attachments';
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
  /** Names only. The bytes are not kept after the turn is sent. */
  attachmentNames?: string[];
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
  /** Files staged for the next message. */
  attachments: Attachment[];
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
    attachments: [],
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
      // Replies whose decision was already stored come back marked, or every
      // old decision card would offer to save itself a second time.
      const saved = await savedSourceMessages(latest.id);
      if (cancelled) {
        return;
      }
      const turns: Turn[] = messages.map((message) =>
        message.role === 'user'
          ? { id: message.id, role: 'user', text: message.text, at: Date.parse(message.createdAt) }
          : {
              id: message.id,
              role: 'maya',
              at: Date.parse(message.createdAt),
              // The stored reply, whole, so options and the decision card come
              // back. Rows written before the response column fall back to the
              // columns, which is all they ever held. Either way the voice is
              // silenced: the reply is shown again, not replayed.
              response: {
                ...(message.response ?? {
                  message: message.text,
                  emotion: (message.emotion ?? 'neutral') as MayaResponse['emotion'],
                  pose: (message.pose ?? 'default') as MayaResponse['pose'],
                  scene: (message.scene ?? 'work') as MayaResponse['scene'],
                }),
                voice: { shouldPlay: false },
              },
              warnings: [],
              source: 'mock',
              decisionSaved: saved.has(message.id),
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

  const addAttachment = useCallback((attachment: Attachment) => {
    setState((current) => ({ ...current, attachments: [...current.attachments, attachment] }));
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      attachments: current.attachments.filter((attachment) => attachment.id !== id),
    }));
  }, []);

  const send = useCallback(
    async (rawText?: string, scriptId?: string) => {
      const text = (rawText ?? state.draft).trim();
      const attachments = state.attachments;
      // docs/ACCEPTANCE_CRITERIA.md: a duplicate send while waiting is prevented.
      // An attachment on its own is a valid turn; a bare screenshot asks a
      // question by itself.
      if ((!text && attachments.length === 0) || waitingRef.current) {
        return;
      }

      waitingRef.current = true;
      // Before any await, so the character reacts inside 200ms.
      runtime.beginThinking();

      const userTurn: UserTurn = {
        id: turnId('user'),
        role: 'user',
        text: text || '（添付のみ）',
        at: Date.now(),
        ...(attachments.length
          ? { attachmentNames: attachments.map((attachment) => attachment.name) }
          : {}),
      };
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
        attachments: [],
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
        // Read fresh on every send rather than once per screen, so a decision
        // saved one reply ago is already something she remembers.
        const decisions = await loadDecisionsForPrompt();
        const reply = await ask({
          message: text || 'この添付について、気づくことを教えてください。',
          attachments: attachments.map((attachment) => ({
            kind: attachment.kind,
            name: attachment.name,
            mimeType: attachment.mimeType,
            data: attachment.data,
          })),
          history,
          company,
          decisions,
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
          // The typed text and the files come back so a retry costs nothing.
          draft: text,
          attachments,
        }));
      } finally {
        abort.current = null;
      }
    },
    [company, companyIsReal, historyDepth, runtime, state.attachments, state.draft],
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

  /**
   * Stores a confirmed decision, then marks its reply.
   *
   * Marked only after the write succeeds. The old version flipped the flag
   * straight away and stored nothing, so the card said 保存しました and the
   * decision was gone on the next launch.
   */
  const saveDecision = useCallback(async (turnIdToSave: string, draft: DecisionDraft) => {
    await storeDecision({
      draft,
      conversationId: conversationId.current,
      sourceMessageId: turnIdToSave,
    });
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

  return {
    ...state,
    setDraft,
    addAttachment,
    removeAttachment,
    send,
    cancel,
    retry,
    dismissError,
    saveDecision,
  };
}
