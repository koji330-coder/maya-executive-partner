/**
 * Time, as MAYA gets to see it.
 *
 * History used to reach the model as bare text, so a remark from three days ago
 * and one from five minutes ago arrived looking the same. She called the old
 * one さっき, and a theme from the night before carried straight into the next
 * morning's おはようございます.
 */

/**
 * How long a pause has to be before it is worth marking.
 *
 * Long enough that a normal back-and-forth, with a coffee in the middle, stays
 * unmarked. Short enough that "after lunch" and "this morning" are told apart.
 */
export const GAP_MS = 3 * 60 * 60 * 1000;

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** `9月12日(金) 21:40`, in the device's own time zone. */
export function formatStamp(at: number): string {
  const date = new Date(at);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}月${date.getDate()}日(${WEEKDAYS[date.getDay()]}) ${hh}:${mm}`;
}

/** `2026年9月12日(金) 21:40`, for the one place the year matters: now. */
export function formatNow(now: Date): string {
  return `${now.getFullYear()}年${formatStamp(now.getTime())}`;
}

function sameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
  );
}

/**
 * Whether a message should carry a time stamp.
 *
 * The first one always does, since the model has nothing to measure it against.
 * After that, only where time actually passed: a new day, or a long pause.
 * Stamping every line would teach her to read out times.
 */
export function needsStamp(at: number, previousAt: number | null): boolean {
  if (previousAt === null) {
    return true;
  }
  return !sameLocalDay(at, previousAt) || at - previousAt >= GAP_MS;
}

/** Prefixes the stamps. Order is preserved; only the text of marked lines changes. */
export function stampHistory<T extends { at: number; text: string }>(entries: T[]): T[] {
  let previous: number | null = null;
  return entries.map((entry) => {
    const stamped = needsStamp(entry.at, previous)
      ? { ...entry, text: `〔${formatStamp(entry.at)}〕${entry.text}` }
      : entry;
    previous = entry.at;
    return stamped;
  });
}
