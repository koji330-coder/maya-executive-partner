/**
 * Stand-in records for the Decisions screen until Phase 5 stores real ones.
 *
 * The shape follows the `decisions` table in `docs/DATA_MODEL.md`, so the screen
 * built against these renders unchanged once a repository replaces them.
 */
export type DecisionStatus = 'active' | 'completed' | 'reconsider';

export interface DecisionRecord {
  id: string;
  title: string;
  reason: string;
  status: DecisionStatus;
  createdAt: string;
  followUpDate?: string | null;
}

export const STATUS_LABEL: Record<DecisionStatus, string> = {
  active: '検討中',
  completed: '完了',
  reconsider: '再検討',
};

export const MOCK_DECISIONS: DecisionRecord[] = [
  {
    id: 'd-2026-09-11',
    title: '競合の値下げには追随しない',
    reason: '粗利率が3.2ポイント落ちる。まず2週間、CVRの変化を見る。',
    status: 'active',
    createdAt: '2026-09-11',
    followUpDate: '2026-09-25',
  },
  {
    id: 'd-2026-09-04',
    title: '製造の中途採用を1名に絞る',
    reason: '先月と同じ議論。要員計画の前提が更新されていない。',
    status: 'reconsider',
    createdAt: '2026-09-04',
    followUpDate: null,
  },
  {
    id: 'd-2026-08-28',
    title: '受注管理をスプレッドシートから移行する',
    reason: '二重入力が週4時間。移行費用は3か月で回収できる。',
    status: 'completed',
    createdAt: '2026-08-28',
    followUpDate: null,
  },
];
