/**
 * Fixed rules for Jev routing.
 *
 * Jev decides what the answer cannot do without. It is not good at "not
 * required, but it would make the answer his own" (useful_tool reached 90% in
 * 28% of the cases that called for it, E2E v2, 2026-09-28). Where the president
 * wants his own data in the answer anyway, a rule says so here, in code, where
 * it can be read and tested. The settings screen lists them.
 *
 * A rule is consulted only when Jev is sure no data is required. It never
 * overrides a tool Jev chose, and it never fires when routing is off.
 *
 * To add one: append to JEV_RULES, give it an id that will not change (logs
 * and saved conversations refer to it), and add a case to jevRules.test.ts.
 */
import { refersToFitness } from './fitlog';

export interface RuleContext {
  message: string;
  /** Jev's reading of which day or month is meant (see jevRouter.ts). */
  period: string;
  /** The president's date, YYYY-MM-DD. */
  today: string;
  /** Tools connected on this server. A rule for a missing tool does nothing. */
  available: string[];
}

export interface JevRule {
  id: string;
  /** What the settings screen shows. */
  title: string;
  description: string;
  tool: string;
  /** The arguments to read with, or null when this turn is not for the rule. */
  match(context: RuleContext): Record<string, unknown> | null;
}

function yesterday(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export const JEV_RULES: JevRule[] = [
  {
    id: 'fitness-own-data',
    title: '体の相談には、その日の FIT LOG を添える',
    description:
      '「データ不要」と判断された質問でも、体・食事・運動・睡眠の話（従来と同じ言葉の判定）なら、' +
      'fitlog_day を先に読んでから答えます。Jev が「昨日」と読んだときは昨日の分を読みます。' +
      '「減量中のタンパク質の目安は？」に、一般論ではなく Gakky の数字で答えるためのルールです。',
    tool: 'fitlog_day',
    match: ({ message, period, today }) => {
      if (!refersToFitness(message)) return null;
      return period === 'yesterday' ? { date: yesterday(today) } : {};
    },
  },
];

/** The first rule that applies to this turn, with the arguments to read. */
export function matchRule(context: RuleContext): { rule: JevRule; args: Record<string, unknown> } | null {
  for (const rule of JEV_RULES) {
    if (!context.available.includes(rule.tool)) continue;
    const args = rule.match(context);
    if (args) return { rule, args };
  }
  return null;
}
