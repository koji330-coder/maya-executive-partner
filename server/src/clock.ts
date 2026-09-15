/**
 * The president's time, on a server whose own time zone is not his.
 *
 * The prompt tells MAYA what "now" is, and the helpers that format it
 * (`src/features/chat/timeline.ts`) read the local calendar with getHours() and
 * friends. On a phone in Tokyo that is Tokyo. A Worker on Cloudflare runs in UTC,
 * so the same code would tell MAYA it is noon when the president is at dinner.
 *
 * Rather than fork the formatting code, the server hands it a Date shifted so its
 * local fields read as Tokyo wall-clock time. The shift is measured from the
 * runtime, not assumed. The first version assumed UTC and added nine hours; the
 * local dev server runs in the PC's own zone, which is already Tokyo, so MAYA
 * said "朝です、まだ7時前です" at 21:47. Production and development now get the
 * shift each of them actually needs.
 */
export const PRESIDENT_UTC_OFFSET_MINUTES = 9 * 60;

/**
 * @param runtimeOffsetMinutes the runtime's own offset east of UTC. Injectable so
 *   the arithmetic can be tested without changing the machine's time zone.
 */
export function presidentNow(
  now: number = Date.now(),
  runtimeOffsetMinutes: number = -new Date(now).getTimezoneOffset(),
): Date {
  return new Date(now + (PRESIDENT_UTC_OFFSET_MINUTES - runtimeOffsetMinutes) * 60 * 1000);
}

/**
 * `YYYY-MM-DD` in Tokyo, for the usage ledger.
 *
 * Built from UTC fields on purpose, so it does not depend on the runtime zone at
 * all: a ceiling that reset at 9am would let a late night and the next morning
 * share one day's budget.
 */
export function presidentDate(now: number = Date.now()): string {
  return new Date(now + PRESIDENT_UTC_OFFSET_MINUTES * 60 * 1000).toISOString().slice(0, 10);
}
