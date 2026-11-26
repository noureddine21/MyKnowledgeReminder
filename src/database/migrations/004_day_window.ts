import type { Migration } from './types';

/** Day planner: per-day window ("HH:mm") and optional work hours (null = day off). */
export const migration004: Migration = {
  version: 4,
  name: 'day_window',
  statements: [
    'ALTER TABLE day_plans ADD COLUMN day_start TEXT',
    'ALTER TABLE day_plans ADD COLUMN day_end TEXT',
    'ALTER TABLE day_plans ADD COLUMN work_start TEXT',
    'ALTER TABLE day_plans ADD COLUMN work_end TEXT',
  ],
};
