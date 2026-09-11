/**
 * Client-side environment configuration.
 *
 * Only EXPO_PUBLIC_* values are readable here, and they are embedded in the
 * bundle. docs/TECH_ARCHITECTURE.md §10: no provider API keys in the app, and
 * no direct calls to model providers from the client. The backend added in
 * Phase 3 is the only thing this app talks to.
 */
export const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export const appEnv = process.env.EXPO_PUBLIC_ENV ?? 'development';

export function isApiConfigured(): boolean {
  return apiBaseUrl.trim().length > 0;
}
