/** Values SQLite can bind as a statement parameter. */
export type BindValue = string | number | boolean | null | Uint8Array;

/**
 * The slice of expo-sqlite this app actually uses.
 *
 * Declaring it here lets the driver be resolved per platform, so the web bundle
 * never pulls in the SQLite wasm worker.
 */
export interface LocalDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: BindValue[]): Promise<unknown>;
  getFirstAsync<T>(source: string, ...params: BindValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: BindValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}

export interface LocalDatabaseDriver {
  readonly isSupported: boolean;
  readonly unsupportedReason: string | null;
  open(name: string): Promise<LocalDatabase>;
}
