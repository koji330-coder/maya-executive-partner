import * as SQLite from 'expo-sqlite';

import type { LocalDatabase, LocalDatabaseDriver } from './localDatabase';

/** Native driver. Metro picks `driver.web.ts` for the web bundle instead. */
export const driver: LocalDatabaseDriver = {
  isSupported: true,
  unsupportedReason: null,
  open: (name: string): Promise<LocalDatabase> => SQLite.openDatabaseAsync(name),
};
