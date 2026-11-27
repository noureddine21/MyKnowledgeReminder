import { getRepositories } from '../database/repositories';
import type { AppSettings } from '../models';
import { ValidationError } from '../utils/errors';
import { validateReviewIntervals } from '../utils/validation';

export async function getSettings(): Promise<AppSettings> {
  const repos = await getRepositories();
  return repos.settings.getAll();
}

export async function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  if (key === 'reviewIntervals') {
    const error = validateReviewIntervals(value as number[]);
    if (error) {
      throw new ValidationError({ reviewIntervals: error });
    }
  }
  const timeKeys: (keyof AppSettings)[] = [
    'defaultReminderTime',
    'planMorningTime',
    'planDayStart',
    'planDayEnd',
    'planWorkStart',
    'planWorkEnd',
  ];
  if (timeKeys.includes(key) && !/^\d{2}:\d{2}$/.test(String(value))) {
    throw new ValidationError({ [key]: 'Invalid time.' });
  }
  if (
    key === 'planWorkDays' &&
    !(Array.isArray(value) && (value as number[]).every(d => Number.isInteger(d) && d >= 0 && d <= 6))
  ) {
    throw new ValidationError({ planWorkDays: 'Invalid work days.' });
  }
  const repos = await getRepositories();
  await repos.settings.set(key, value);
}
