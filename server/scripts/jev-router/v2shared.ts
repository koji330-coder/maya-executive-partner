/** Shapes shared by the E2E v2 runner and its report. */
import type { AbsoluteVerdict } from './judge2.ts';
import type { PipelineResult } from './pipelines.ts';
import type { V2Turn } from './pipelines2.ts';
import { USD_PER_INPUT_TOKEN } from './typesafe.ts';

export const PIPELINES = ['current', 'jev_all', 'jev_topp', 'jev_floor'] as const;
export type PipelineName = (typeof PIPELINES)[number];

export interface V2Row {
  case_id: string;
  rep: number;
  turn: V2Turn;
  /** Answer text per pipeline ('' when invalid or failed). */
  messages: Record<PipelineName, string>;
  valid: Record<PipelineName, boolean>;
  /** Rep 1 only. Keyed by pipeline; pipelines with the same answer share a verdict. */
  judge: Partial<Record<PipelineName, AbsoluteVerdict>>;
  /** A second verdict on the same answer, for judge stability (first answers of rep 1). */
  judgeRepeat: Partial<Record<PipelineName, AbsoluteVerdict>>;
}

export function resultFor(turn: V2Turn, name: PipelineName): PipelineResult {
  if (name === 'current' || (!turn.direct && !turn.fallback)) return turn.current;
  if (turn.direct) return turn.direct;
  const fallback = turn.fallback!;
  return name === 'jev_all' ? fallback.all : name === 'jev_topp' ? fallback.topp : fallback.floor;
}

/** What this turn really cost across APIs: shared and reused runs counted once. */
export function actualSpend(turn: V2Turn): number {
  let total = turn.current.costUsd;
  if (!turn.jev) return total;
  const jevCost = turn.jev.inputTokens * USD_PER_INPUT_TOKEN;
  total += jevCost;
  if (turn.direct) return total + turn.direct.costUsd - jevCost;
  if (turn.fallback && turn.sets) {
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((n) => b.includes(n));
    const { topp, floor, offered } = turn.sets;
    if (!same(topp, offered)) total += turn.fallback.topp.costUsd - jevCost;
    if (!same(floor, offered) && !same(floor, topp)) total += turn.fallback.floor.costUsd - jevCost;
  }
  return total;
}

