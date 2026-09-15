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
  deleteConversationIfEmpty,
  deleteMessage,
  listConversations,
  loadMessages,
  saveMayaMessage,
  saveUserMessage,
} from './conversationRepository';
import type { MayaResponse } from './mayaResponse';
import { MockResponderError } from './mockResponder';
import { ask } from './responder';
import type { CompanyContext } from './systemPrompt';
import { formatStamp, needsStamp, stampHistory } from './timeline';

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
  /**
   * Loaded from storage rather than just received. The reaction spotlight skips
   * these: opening an old conversation should not make her lean in as if the
   * last reply had only now arrived.
   */
  restored?: boolean;
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

function newConversationId() {
  sequence += 1;
  return `conv-${Date.now()}-${sequence}`;
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

const EMPTY: ConversationState = {
  turns: [],
  latest: null,
  waiting: false,
  error: null,
  draft: '',
  attachments: [],
};

/** A stored conversation, rebuilt as turns. Empty when it has no messages. */
async function loadConversationTurns(id: string): Promise<Turn[]> {
  const messages = await loadMessages(id);
  if (messages.length === 0) {
    return [];
  }
  // Replies whose decision was already stored come back marked, or every old
  // decision card would offer to save itself a second time.
  const saved = await savedSourceMessages(id);
  return messages.map((message) =>
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
          restored: true,
        },
  );
}

function lastMayaTurn(turns: Turn[]): MayaTurn | null {
  return [...turns].reverse().find((turn): turn is MayaTurn => turn.role === 'maya') ?? null;
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
  const [state, setState] = useState<ConversationState>(EMPTY);

  const waitingRef = useRef(false);
  const abort = useRef<AbortController | null>(null);
  // Which conversation new messages go into. It changes when the president
  // starts a new one or opens an old one. Decisions are not tied to it, so
  // every conversation remembers the same decisions.
  const conversationId = useRef(newConversationId());
  const [activeConversationId, setActiveConversationId] = useState(conversationId.current);
  const started = useRef(false);
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = state.turns;
  // Bumped whenever the screen switches conversation. A reply that was on its
  // way for the previous one must not land in the new one.
  const generation = useRef(0);

  // Reopen the most recent conversation so closing the app does not lose it.
  // Starting fresh is the president's call, made with the new-conversation
  // button, not something the app decides for him.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const recent = await listConversations(1);
      const latest = recent[0];
      if (!latest || cancelled) {
        return;
      }
      const turns = await loadConversationTurns(latest.id);
      if (cancelled || turns.length === 0) {
        return;
      }
      conversationId.current = latest.id;
      started.current = true;
      setActiveConversationId(latest.id);
      setState((current) => ({ ...current, turns, latest: lastMayaTurn(turns) }));
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

      // Captured, not read later: if the president switches conversation while
      // this is in flight, the reply still belongs to the one it was asked in.
      const convId = conversationId.current;
      const myGeneration = generation.current;

      const userTurn: UserTurn = {
        id: turnId('user'),
        role: 'user',
        text: text || '（添付のみ）',
        at: Date.now(),
        ...(attachments.length
          ? { attachmentNames: attachments.map((attachment) => attachment.name) }
          : {}),
      };
      const createdHere = !started.current;
      const conversationSaved = createdHere
        ? // The opening question names the conversation; it is what it was about.
          createConversation(convId, text.slice(0, 40))
        : Promise.resolve();
      started.current = true;
      const userSaved = conversationSaved.then(() => saveUserMessage(convId, userTurn.id, text));

      const previous = turnsRef.current;
      setState((current) => ({
        ...current,
        turns: [...current.turns, userTurn],
        waiting: true,
        error: null,
        draft: '',
        attachments: [],
      }));

      // Stamped where time passed, so a remark from yesterday no longer reads as
      // just now. The newest message is stamped only when time has passed since
      // the history; "now" itself is in the system prompt.
      const history: ChatExchange[] = stampHistory(
        previous.slice(-historyDepth).map((turn) =>
          turn.role === 'user'
            ? { role: 'user' as const, text: turn.text, at: turn.at }
            : { role: 'maya' as const, text: turn.response.message, at: turn.at },
        ),
      ).map(({ role, text: line }) => ({ role, text: line }));
      const lastAt = previous.at(-1)?.at ?? null;
      const question = text || 'この添付について、気づくことを教えてください。';
      const message =
        lastAt !== null && needsStamp(userTurn.at, lastAt)
          ? `〔${formatStamp(userTurn.at)}〕${question}`
          : question;

      const controller = new AbortController();
      abort.current = controller;

      try {
        // Read fresh on every send rather than once per screen, so a decision
        // saved one reply ago is already something she remembers.
        const decisions = await loadDecisionsForPrompt();
        const reply = await ask({
          message,
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

        const turn: MayaTurn = {
          id: turnId('maya'),
          role: 'maya',
          at: Date.now(),
          response: reply.response,
          warnings: reply.warnings,
          source: reply.source,
        };
        void saveMayaMessage(convId, turn.id, reply.response);

        if (generation.current !== myGeneration) {
          // Saved to the conversation it was asked in, but not shown here.
          return;
        }
        waitingRef.current = false;
        runtime.applyResponse({
          emotion: reply.response.emotion,
          pose: reply.response.pose,
          scene: reply.response.scene,
        });
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
        // An unanswered message is taken back rather than left in the
        // transcript. Leaving it there while also restoring it to the input
        // showed the same words twice, and sending either copy stored a second
        // one: the duplicated message in the exported log.
        void userSaved.then(async () => {
          await deleteMessage(userTurn.id);
          if (createdHere) {
            await deleteConversationIfEmpty(convId);
          }
        });

        if (generation.current !== myGeneration) {
          return;
        }
        if (createdHere) {
          started.current = false;
        }
        // The character must not be left mid-thought when a send fails.
        runtime.cancelThinking();
        waitingRef.current = false;
        const cancelled = error instanceof Error && error.name === 'AbortError';
        setState((current) => ({
          ...current,
          turns: current.turns.filter((turn) => turn.id !== userTurn.id),
          waiting: false,
          // A cancel was the user's own doing, so it is not reported as a fault.
          error: cancelled ? null : describe(error),
          // The typed text and the files come back so a retry costs nothing.
          draft: text,
          attachments,
        }));
      } finally {
        if (abort.current === controller) {
          abort.current = null;
        }
      }
    },
    [company, companyIsReal, historyDepth, runtime, state.attachments, state.draft],
  );

  const cancel = useCallback(() => {
    abort.current?.abort();
  }, []);

  /** Sends what came back to the input. The failed message was already taken back. */
  const retry = useCallback(() => {
    void send();
  }, [send]);

  const dismissError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  const switchTo = useCallback(
    (id: string, turns: Turn[]) => {
      generation.current += 1;
      abort.current?.abort();
      abort.current = null;
      waitingRef.current = false;
      runtime.cancelThinking();
      conversationId.current = id;
      started.current = turns.length > 0;
      setActiveConversationId(id);
      setState({ ...EMPTY, turns, latest: lastMayaTurn(turns) });
    },
    [runtime],
  );

  /**
   * Starts an empty conversation.
   *
   * Nothing is stored until the first message, so pressing the button twice
   * does not leave an empty entry in the conversation list.
   */
  const startNewConversation = useCallback(() => {
    switchTo(newConversationId(), []);
  }, [switchTo]);

  const openConversation = useCallback(
    async (id: string) => {
      const turns = await loadConversationTurns(id);
      switchTo(id, turns);
    },
    [switchTo],
  );

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
    activeConversationId,
    setDraft,
    addAttachment,
    removeAttachment,
    send,
    cancel,
    retry,
    dismissError,
    saveDecision,
    startNewConversation,
    openConversation,
  };
}
