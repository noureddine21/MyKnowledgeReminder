import type { Migration } from './types';

/**
 * Initial schema.
 * Timestamps are INTEGER epoch milliseconds. Booleans are INTEGER 0/1.
 */
export const migration001: Migration = {
  version: 1,
  name: 'initial_schema',
  statements: [
    `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      color TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'tag-outline',
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      created_at INTEGER NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS information (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      content TEXT NOT NULL CHECK (length(trim(content)) > 0),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      source TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_information_category ON information(category_id)',
    'CREATE INDEX IF NOT EXISTS idx_information_created_at ON information(created_at)',

    `CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      information_id INTEGER NOT NULL UNIQUE REFERENCES information(id) ON DELETE CASCADE,
      scheduled_at INTEGER NOT NULL,
      frequency TEXT NOT NULL CHECK (frequency IN ('once', 'daily', 'weekly', 'monthly', 'spaced')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      notification_id TEXT,
      spaced_step INTEGER NOT NULL DEFAULT 0,
      spaced_base_at INTEGER,
      last_reviewed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_reminders_active_scheduled ON reminders(is_active, scheduled_at)',

    `CREATE TABLE IF NOT EXISTS review_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      information_id INTEGER NOT NULL REFERENCES information(id) ON DELETE CASCADE,
      reviewed_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('reviewed', 'rescheduled'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_review_history_info ON review_history(information_id, reviewed_at)',

    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`,

    `INSERT OR IGNORE INTO categories (name, color, icon, is_default, created_at) VALUES
      ('Quran', '#0E9F6E', 'book-open-page-variant', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
      ('Hadith', '#B7791F', 'script-text-outline', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
      ('Technology', '#3F83F8', 'laptop', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
      ('French', '#E02424', 'translate', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
      ('Personal Notes', '#9061F9', 'notebook-outline', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
      ('Other', '#6B7280', 'shape-outline', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000)`,
  ],
};
