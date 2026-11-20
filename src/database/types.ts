/**
 * Minimal database abstraction used by repositories.
 * Keeps the rest of the code independent from the concrete SQLite driver (op-sqlite)
 * and lets repositories run either on the main connection or inside a transaction.
 */

export type SqlParam = string | number | null;

export type SqlRow = Record<string, unknown>;

export interface SqlResult {
  rows: SqlRow[];
  insertId?: number;
  rowsAffected: number;
}

export interface SqlExecutor {
  execute(sql: string, params?: SqlParam[]): Promise<SqlResult>;
}

export interface AppDatabase extends SqlExecutor {
  /** Runs `fn` in a transaction; rolls back if it throws. */
  transaction(fn: (tx: SqlExecutor) => Promise<void>): Promise<void>;
  close(): void;
}
