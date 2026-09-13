import type { RequestAttachment } from './geminiClient';

/**
 * The spending and free-tier rules, with no storage attached.
 *
 * They used to live beside the key store and the usage table, which import
 * expo-secure-store and SQLite. The MAYA server (`server/`) needs the same rules
 * and cannot load either, so the rules live here and both sides import them.
 * One rule, one place: a server that priced turns differently from the app
 * would quietly break the daily ceiling.
 */

/**
 * What the paid tier is assumed to cost, in yen per 1000 tokens.
 *
 * Deliberately pessimistic. This drives a local circuit breaker, not an invoice
 * prediction, so being wrong in the expensive direction is the safe failure.
 * Google's real price is lower; check it before relaxing this.
 */
export const ASSUMED_YEN_PER_1K_TOKENS = 0.4;

/** A consultation turn runs a few thousand tokens once thinking is counted. */
export const ASSUMED_TOKENS_PER_TURN = 4000;

export function estimateTurnYen(tokens = ASSUMED_TOKENS_PER_TURN): number {
  return Math.max(0.01, (tokens / 1000) * ASSUMED_YEN_PER_1K_TOKENS);
}

/**
 * Roughly what attachments add to a turn.
 *
 * The image figure is a measured screenshot (about 1,100 prompt tokens) rounded
 * up; text uses the usual characters-per-token approximation for Japanese.
 */
export function estimateRequestAttachmentTokens(attachments?: RequestAttachment[]): number {
  return (attachments ?? []).reduce(
    (total, attachment) =>
      total + (attachment.kind === 'image' ? 1300 : Math.ceil(attachment.data.length / 2)),
    0,
  );
}

/**
 * Whether the free key may carry this turn.
 *
 * MAYA injects the company profile into every consultation, so once real company
 * facts are saved the free tier would send them on each message. Voicebox could
 * leave that to the user's judgement per recording; here the context is attached
 * automatically, so the app has to decide.
 *
 * The free tier may use what it is sent to improve Google's products. The
 * president decided on 2026-09-13 that his own health records may go there, but
 * a company registered as real may not (docs/LLM_INTEGRATION.md).
 */
export function freeTierAllowed(hasRealCompanyData: boolean): boolean {
  return !hasRealCompanyData;
}
