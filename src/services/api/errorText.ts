import { ServerError } from './server';

/**
 * What to tell the president when storage failed.
 *
 * A server failure already carries a message written for him (which Wi-Fi to
 * check, what was refused). A local database failure carries an engine message
 * that means nothing to him, so it gets the generic line instead.
 */
export function errorText(error: unknown, fallback: string): string {
  return error instanceof ServerError ? error.message : fallback;
}
