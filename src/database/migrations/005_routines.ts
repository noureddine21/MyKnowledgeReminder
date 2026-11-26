import type { Migration } from './types';

/** Recurring routines automatically added to the day plan on chosen weekdays. */
export const migration005: Migration = {
  version: 5,
  name: 'routines',
  statements: [
    `CREATE TABLE IF NOT EXISTS routines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 5 AND 720),
      fixed_start_min INTEGER CHECK (fixed_start_min IS NULL OR fixed_start_min BETWEEN 0 AND 1439),
      important INTEGER NOT NULL DEFAULT 0 CHECK (important IN (0, 1)),
      days TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at INTEGER NOT NULL
    )`,
  ],
};
