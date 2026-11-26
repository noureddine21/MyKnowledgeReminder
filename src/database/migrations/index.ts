import type { AppDatabase } from '../types';
import { migration001 } from './001_initial';
import { migration002 } from './002_repeat_interval';
import { migration003 } from './003_day_planner';
import { migration004 } from './004_day_window';
import type { Migration } from './types';

/**
 * Ordered list of migrations. To change the schema, add a new file
 * (e.g. 002_add_x.ts) and append it here. Never edit a released migration.
 */
export const MIGRATIONS: Migration[] = [migration001, migration002, migration003, migration004];

export async function getSchemaVersion(db: AppDatabase): Promise<number> {
  const result = await db.execute('PRAGMA user_version');
  const row = result.rows[0];
  return row ? Number(row.user_version ?? 0) : 0;
}

/**
 * Applies pending migrations, each in its own transaction, and bumps user_version.
 * Returns the resulting schema version.
 */
export async function runMigrations(
  db: AppDatabase,
  migrations: Migration[] = MIGRATIONS,
): Promise<number> {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  let current = await getSchemaVersion(db);

  for (const migration of sorted) {
    if (migration.version <= current) {
      continue;
    }
    await db.transaction(async tx => {
      for (const statement of migration.statements) {
        await tx.execute(statement);
      }
      // PRAGMA does not accept bound parameters; version is a trusted integer.
      await tx.execute(`PRAGMA user_version = ${Math.trunc(migration.version)}`);
    });
    current = migration.version;
  }
  return current;
}
