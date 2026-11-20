/**
 * Real SQLite (sql.js / WebAssembly) implementation of AppDatabase for tests.
 * Lets migrations, repositories and services run actual SQL in Jest.
 */
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import { runMigrations } from '../src/database/migrations';
import type { AppDatabase, SqlExecutor, SqlParam, SqlResult } from '../src/database/types';

let sqlModule: Awaited<ReturnType<typeof initSqlJs>> | null = null;

function run(db: SqlJsDatabase, sql: string, params: SqlParam[] = []): SqlResult {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    const rowsAffected = db.getRowsModified();
    const idResult = db.exec('SELECT last_insert_rowid() AS id');
    const insertId = Number(idResult[0]?.values[0]?.[0] ?? 0) || undefined;
    return { rows, rowsAffected, insertId };
  } finally {
    stmt.free();
  }
}

export async function createTestDatabase(options: { migrate?: boolean } = {}): Promise<AppDatabase> {
  sqlModule = sqlModule ?? (await initSqlJs());
  const db = new sqlModule.Database();
  const executor: SqlExecutor = {
    async execute(sql, params) {
      return run(db, sql, params);
    },
  };
  const appDb: AppDatabase = {
    execute: executor.execute,
    async transaction(fn) {
      db.run('BEGIN');
      try {
        await fn(executor);
        db.run('COMMIT');
      } catch (error) {
        db.run('ROLLBACK');
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
  await appDb.execute('PRAGMA foreign_keys = ON');
  if (options.migrate !== false) {
    await runMigrations(appDb);
  }
  return appDb;
}
