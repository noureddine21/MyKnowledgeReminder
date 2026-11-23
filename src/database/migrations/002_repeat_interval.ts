import type { Migration } from './types';

/**
 * Adds custom repeats ("every N hours/days/weeks/months"):
 *  - new `hourly` frequency,
 *  - `repeat_interval` column (1 = every hour/day/week/month).
 * SQLite cannot alter a CHECK constraint, so the reminders table is rebuilt
 * and existing rows are copied with repeat_interval = 1 (same behaviour as before).
 */
export const migration002: Migration = {
  version: 2,
  name: 'repeat_interval',
  statements: [
    `CREATE TABLE reminders_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      information_id INTEGER NOT NULL UNIQUE REFERENCES information(id) ON DELETE CASCADE,
      scheduled_at INTEGER NOT NULL,
      frequency TEXT NOT NULL CHECK (frequency IN ('once', 'hourly', 'daily', 'weekly', 'monthly', 'spaced')),
      repeat_interval INTEGER NOT NULL DEFAULT 1 CHECK (repeat_interval BETWEEN 1 AND 999),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      notification_id TEXT,
      spaced_step INTEGER NOT NULL DEFAULT 0,
      spaced_base_at INTEGER,
      last_reviewed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `INSERT INTO reminders_new
       (id, information_id, scheduled_at, frequency, repeat_interval, is_active, notification_id,
        spaced_step, spaced_base_at, last_reviewed_at, created_at, updated_at)
     SELECT id, information_id, scheduled_at, frequency, 1, is_active, notification_id,
        spaced_step, spaced_base_at, last_reviewed_at, created_at, updated_at
     FROM reminders`,
    'DROP TABLE reminders',
    'ALTER TABLE reminders_new RENAME TO reminders',
    'CREATE INDEX IF NOT EXISTS idx_reminders_active_scheduled ON reminders(is_active, scheduled_at)',
  ],
};
