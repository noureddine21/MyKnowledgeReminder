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
  if (key === 'defaultReminderTime' && !/^\d{2}:\d{2}$/.test(String(value))) {
    throw new ValidationError({ defaultReminderTime: 'Invalid time.' });
  }
  const repos = await getRepositories();
  await repos.settings.set(key, value);
}
