import { useCallback, useEffect, useState } from 'react';

import {
  EMPTY_PROFILE,
  hasProfile,
  loadCompanyProfile,
  saveCompanyProfile,
  toCompanyContext,
  type CompanyProfile,
} from './companyRepository';

export interface UseCompanyProfile {
  profile: CompanyProfile;
  loaded: boolean;
  dirty: boolean;
  saving: boolean;
  /** Set when a save failed. A silent no-op button is worse than a message. */
  error: string | null;
  set: <K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) => void;
  save: () => Promise<void>;
  context: ReturnType<typeof toCompanyContext>;
  filled: boolean;
}

/**
 * Loads the company profile and keeps edits until they are saved.
 *
 * Reads are best-effort: a profile that fails to load leaves the screen empty
 * rather than blocking it, because a consultation without company facts is still
 * a consultation.
 */
export function useCompanyProfile(): UseCompanyProfile {
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadCompanyProfile();
      if (cancelled) return;
      setProfile(stored);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = useCallback<UseCompanyProfile['set']>((key, value) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveCompanyProfile(profile);
      setProfile((current) => ({ ...current, updatedAt: new Date().toISOString() }));
      setDirty(false);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? `保存できませんでした。${cause.message}`
          : '保存できませんでした。',
      );
    } finally {
      setSaving(false);
    }
  }, [profile]);

  return {
    profile,
    loaded,
    dirty,
    saving,
    error,
    set,
    save,
    context: toCompanyContext(profile),
    filled: hasProfile(profile),
  };
}
