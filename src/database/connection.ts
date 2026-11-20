import { open, type DB, type Scalar } from '@op-engineering/op-sqlite';
import { DATABASE_NAME } from '../constants';
import { AppError, logError } from '../utils/errors';
import { runMigrations } from './migrations';
import type { AppDatabase, SqlExecutor, SqlParam, SqlResult } from './types';

function toResult(result: { rows: Array<Record<string, Scalar>>; insertId?: number; rowsAffected: number }): SqlResult {
  return {
    rows: result.rows as SqlResult['rows'],
    insertId: result.insertId,
    rowsAffected: result.rowsAffected,
  };
}

function wrap(db: DB): AppDatabase {
  return {
    async execute(sql: string, params: SqlParam[] = []) {
      return toResult(await db.execute(sql, params));
    },
    async transaction(fn) {
      await db.transaction(async tx => {
        const executor: SqlExecutor = {
          async execute(sql: string, params: SqlParam[] = []) {
            return toResult(await tx.execute(sql, params));
          },
        };
        await fn(executor);
      });
    },
    close() {
      db.close();
    },
  };
}

let instance: AppDatabase | null = null;
let initPromise: Promise<AppDatabase> | null = null;

/**
 * Opens the database once, enables foreign keys and runs pending migrations.
 * Safe to call from anywhere (concurrent callers share the same promise).
 */
export function getDatabase(): Promise<AppDatabase> {
  if (instance) {
    return Promise.resolve(instance);
  }
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const db = wrap(open({ name: DATABASE_NAME }));
        await db.execute('PRAGMA foreign_keys = ON');
        await db.execute('PRAGMA journal_mode = WAL');
        await runMigrations(db);
        instance = db;
        return db;
      } catch (error) {
        initPromise = null;
        logError('database:init', error);
        throw new AppError(
          'DATABASE',
          'The local database could not be opened. Please restart the app.',
          error,
        );
      }
    })();
  }
  return initPromise;
}
