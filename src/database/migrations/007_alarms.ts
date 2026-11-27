import type { Migration } from './types';

/** Alarm mode per reminder, day-plan task and routine (rings until the user answers). */
export const migration007: Migration = {
  version: 7,
  name: 'alarms',
  statements: [
    'ALTER TABLE reminders ADD COLUMN alarm INTEGER NOT NULL DEFAULT 0 CHECK (alarm IN (0, 1))',
    'ALTER TABLE plan_tasks ADD COLUMN alarm INTEGER NOT NULL DEFAULT 0 CHECK (alarm IN (0, 1))',
    'ALTER TABLE routines ADD COLUMN alarm INTEGER NOT NULL DEFAULT 0 CHECK (alarm IN (0, 1))',
  ],
};
