/**
 * Backup & restore: the whole database as one JSON file the user saves wherever they
 * want (Google Drive, Downloads, WhatsApp...) through the Android file picker.
 * Stays offline: the app never uploads anything itself.
 */
import { getDatabase } from '../database/connection';
import { getSchemaVersion } from '../database/migrations';
import type { AppDatabase, SqlParam, SqlRow } from '../database/types';
import { AppError, logError } from '../utils/errors';
import { dateKey } from './dayPlanner';
import { applyPlannerSettings } from './planService';
import { resyncAllNotifications } from './reminderSync';

export const BACKUP_APP = 'MyKnowledgeReminder';
export const BACKUP_FORMAT = 1;

/** Insert order (parents first). Tables missing from an older backup are left empty. */
export const BACKUP_TABLES = [
  'categories',
  'information',
  'reminders',
  'review_history',
  'settings',
  'day_plans',
  'plan_tasks',
  'routines',
] as const;

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  schemaVersion: number;
  exportedAt: number;
  tables: Record<string, SqlRow[]>;
}

export interface BackupSummary {
  items: number;
  categories: number;
  plans: number;
  exportedAt: number;
}

async function existingTables(db: AppDatabase): Promise<Set<string>> {
  const result = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(result.rows.map(r => String(r.name)));
}

async function tableColumns(db: AppDatabase, table: string): Promise<string[]> {
  const result = await db.execute(`PRAGMA table_info(${table})`);
  return result.rows.map(r => String(r.name));
}

/** Builds the backup object from the current database. */
export async function createBackup(now: number = Date.now()): Promise<BackupFile> {
  const db = await getDatabase();
  const present = await existingTables(db);
  const tables: Record<string, SqlRow[]> = {};
  for (const table of BACKUP_TABLES) {
    if (present.has(table)) {
      tables[table] = (await db.execute(`SELECT * FROM ${table}`)).rows;
    }
  }
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    schemaVersion: await getSchemaVersion(db),
    exportedAt: now,
    tables,
  };
}

export function backupFileName(now: number = Date.now()): string {
  return `my-knowledge-backup-${dateKey(now)}.json`;
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  return {
    items: backup.tables.information?.length ?? 0,
    categories: backup.tables.categories?.length ?? 0,
    plans: backup.tables.day_plans?.length ?? 0,
    exportedAt: backup.exportedAt,
  };
}

/** Parses and checks a backup file. Throws a user-friendly AppError when it is not valid. */
export async function parseBackup(text: string): Promise<BackupFile> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new AppError('BACKUP', 'This file is not a My Knowledge Reminder backup.', error);
  }
  const backup = data as Partial<BackupFile>;
  if (
    !backup ||
    backup.app !== BACKUP_APP ||
    typeof backup.format !== 'number' ||
    typeof backup.schemaVersion !== 'number' ||
    typeof backup.tables !== 'object' ||
    backup.tables === null
  ) {
    throw new AppError('BACKUP', 'This file is not a My Knowledge Reminder backup.');
  }
  if (backup.format > BACKUP_FORMAT) {
    throw new AppError('BACKUP', 'This backup was made with a newer version of the app. Update the app first.');
  }
  const db = await getDatabase();
  if (backup.schemaVersion > (await getSchemaVersion(db))) {
    throw new AppError('BACKUP', 'This backup was made with a newer version of the app. Update the app first.');
  }
  for (const [name, rows] of Object.entries(backup.tables)) {
    if (!Array.isArray(rows)) {
      throw new AppError('BACKUP', `The backup is damaged (table ${name}).`);
    }
  }
  return backup as BackupFile;
}

/**
 * Replaces ALL current data with the backup, atomically (all or nothing),
 * then rebuilds the scheduled notifications from the restored data.
 */
export async function restoreBackup(backup: BackupFile, now: number = Date.now()): Promise<BackupSummary> {
  const db = await getDatabase();
  const present = await existingTables(db);
  const tables = BACKUP_TABLES.filter(t => present.has(t));
  const columns: Record<string, string[]> = {};
  for (const table of tables) {
    columns[table] = await tableColumns(db, table);
  }

  try {
    await db.transaction(async tx => {
      for (const table of [...tables].reverse()) {
        await tx.execute(`DELETE FROM ${table}`);
      }
      for (const table of tables) {
        for (const row of backup.tables[table] ?? []) {
          // Only columns that exist in this version (older backups may miss new ones).
          const cols = columns[table].filter(c => Object.prototype.hasOwnProperty.call(row, c));
          if (cols.length === 0) {
            continue;
          }
          const values = cols.map(c => (row[c] ?? null) as SqlParam);
          await tx.execute(
            `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
            values,
          );
        }
      }
    });
  } catch (error) {
    throw new AppError('BACKUP', 'The backup could not be restored. Your current data was kept.', error);
  }

  try {
    await resyncAllNotifications(now);
    await applyPlannerSettings(now);
  } catch (error) {
    logError('backup:resync', error);
  }
  return summarizeBackup(backup);
}
