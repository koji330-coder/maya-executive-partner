import type { LocalDatabase, LocalDatabaseDriver } from './localDatabase';

/**
 * Web stub.
 *
 * expo-sqlite on web needs a wasm worker and extra bundler configuration that
 * v0.1 does not need. The web target exists only for fast layout iteration, so
 * it reports the local cache as unavailable rather than pulling that in.
 */
export const driver: LocalDatabaseDriver = {
  isSupported: false,
  unsupportedReason: 'SQLite is not enabled for the web target in v0.1.',
  open: (): Promise<LocalDatabase> => {
    throw new Error('SQLite is not available on web.');
  },
};
