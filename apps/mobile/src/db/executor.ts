/**
 * Minimal async SQL surface implemented by expo-sqlite on device and by
 * `node:sqlite` in unit tests. Keeping the repository on this interface means
 * every queue and money test runs the real SQL, not a mock.
 */
export type SqlParam = string | number | null;

export interface SqlDatabase {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlParam[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: readonly SqlParam[]): Promise<T[]>;
  transaction<T>(work: (db: SqlDatabase) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
