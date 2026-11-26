import type { Migration } from './types';

/** Day planner: one plan per local date ("YYYY-MM-DD") and its organized tasks. */
export const migration003: Migration = {
  version: 3,
  name: 'day_planner',
  statements: [
    `CREATE TABLE IF NOT EXISTS day_plans (
      plan_date TEXT PRIMARY KEY NOT NULL CHECK (length(plan_date) = 10),
      raw_input TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS plan_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_date TEXT NOT NULL REFERENCES day_plans(plan_date) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 5 AND 720),
      fixed_start_min INTEGER CHECK (fixed_start_min IS NULL OR fixed_start_min BETWEEN 0 AND 1439),
      important INTEGER NOT NULL DEFAULT 0 CHECK (important IN (0, 1)),
      position INTEGER NOT NULL,
      start_at INTEGER,
      end_at INTEGER,
      is_done INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
      done_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS idx_plan_tasks_date ON plan_tasks(plan_date, position)',
  ],
};
