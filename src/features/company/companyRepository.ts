import type { CompanyContext } from '@/features/chat/systemPrompt';
import { openDatabase } from '@/services/storage';

/**
 * The company facts MAYA is allowed to know.
 *
 * `docs/UX_SPEC.md` §7 requires the user to be able to see exactly what MAYA
 * knows, so this is the whole of it. Nothing is inferred and stored behind their
 * back; if a fact is not here, MAYA asks.
 */
export interface CompanyProfile {
  name: string;
  industry: string;
  employeeCount: string;
  revenueRange: string;
  description: string;
  goals: string[];
  issues: string[];
  /**
   * Whether these are a real company's numbers.
   *
   * MAYA injects this profile into every consultation, so the free tier would
   * send it on each message. The user declares which this is, and the answer
   * gates the free key. See `docs/LLM_INTEGRATION.md`.
   */
  isRealCompany: boolean;
  updatedAt: string | null;
}

export const EMPTY_PROFILE: CompanyProfile = {
  name: '',
  industry: '',
  employeeCount: '',
  revenueRange: '',
  description: '',
  goals: [],
  issues: [],
  isRealCompany: false,
  updatedAt: null,
};

const ROW_ID = 'current';

function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function loadCompanyProfile(): Promise<CompanyProfile> {
  try {
    const db = await openDatabase();
    const row = await db.getFirstAsync<{
      name: string | null;
      industry: string | null;
      employee_count: number | null;
      revenue_range: string | null;
      description: string | null;
      goals_json: string | null;
      issues_json: string | null;
      updated_at: string | null;
    }>(
      `SELECT name, industry, employee_count, revenue_range, description, goals_json, issues_json, updated_at
       FROM cached_company WHERE id = ?;`,
      ROW_ID,
    );
    if (!row) {
      return EMPTY_PROFILE;
    }
    const goals = parseList(row.goals_json);
    // The real/fictional flag has no column in docs/DATA_MODEL.md, so it rides
    // in the issues blob under a reserved key rather than forcing a migration
    // for one boolean.
    const rawIssues = parseList(row.issues_json);
    const isRealCompany = rawIssues.includes(REAL_FLAG);
    return {
      name: row.name ?? '',
      industry: row.industry ?? '',
      employeeCount: row.employee_count === null ? '' : String(row.employee_count),
      revenueRange: row.revenue_range ?? '',
      description: row.description ?? '',
      goals,
      issues: rawIssues.filter((issue) => issue !== REAL_FLAG),
      isRealCompany,
      updatedAt: row.updated_at,
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

const REAL_FLAG = '__real_company__';

export async function saveCompanyProfile(profile: CompanyProfile): Promise<void> {
  const db = await openDatabase();
  const now = new Date().toISOString();
  const employeeCount = Number(profile.employeeCount.replace(/[^0-9]/g, ''));
  const issues = profile.isRealCompany ? [...profile.issues, REAL_FLAG] : profile.issues;
  await db.runAsync(
    `INSERT INTO cached_company
       (id, name, industry, employee_count, revenue_range, description, goals_json, issues_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       industry = excluded.industry,
       employee_count = excluded.employee_count,
       revenue_range = excluded.revenue_range,
       description = excluded.description,
       goals_json = excluded.goals_json,
       issues_json = excluded.issues_json,
       updated_at = excluded.updated_at;`,
    ROW_ID,
    profile.name.trim(),
    profile.industry.trim(),
    Number.isFinite(employeeCount) && employeeCount > 0 ? employeeCount : null,
    profile.revenueRange.trim(),
    profile.description.trim(),
    JSON.stringify(profile.goals.filter((g) => g.trim())),
    JSON.stringify(issues.filter((i) => i.trim())),
    now,
    now,
  );
}

/** True once anything has been filled in. */
export function hasProfile(profile: CompanyProfile): boolean {
  const goals = profile.goals.filter((g) => g.trim());
  const issues = profile.issues.filter((i) => i.trim());
  return Boolean(
    profile.name ||
      profile.industry ||
      profile.employeeCount ||
      profile.revenueRange ||
      profile.description ||
      goals.length ||
      issues.length,
  );
}

/** Shapes the stored profile for the system prompt, dropping empty fields. */
export function toCompanyContext(profile: CompanyProfile): CompanyContext | undefined {
  if (!hasProfile(profile)) {
    return undefined;
  }
  const employeeCount = Number(profile.employeeCount.replace(/[^0-9]/g, ''));
  const goals = profile.goals.filter((g) => g.trim());
  const issues = profile.issues.filter((i) => i.trim());
  return {
    ...(profile.name ? { name: profile.name } : {}),
    ...(profile.industry ? { industry: profile.industry } : {}),
    ...(Number.isFinite(employeeCount) && employeeCount > 0 ? { employeeCount } : {}),
    ...(profile.revenueRange ? { revenueRange: profile.revenueRange } : {}),
    ...(profile.description ? { description: profile.description } : {}),
    ...(goals.length ? { goals } : {}),
    ...(issues.length ? { issues } : {}),
  };
}
