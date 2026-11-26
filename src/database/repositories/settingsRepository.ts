import { DEFAULT_SETTINGS } from '../../constants';
import type { AppSettings, ThemeMode } from '../../models';
import { withDbError } from '../../utils/errors';
import { validateReviewIntervals } from '../../utils/validation';
import type { SqlExecutor } from '../types';

type SettingKey = keyof AppSettings;

function parseSettings(raw: Record<string, string>): AppSettings {
  const settings: AppSettings = { ...DEFAULT_SETTINGS };

  const theme = raw.themeMode as ThemeMode | undefined;
  if (theme === 'system' || theme === 'light' || theme === 'dark') {
    settings.themeMode = theme;
  }
  if (raw.reviewIntervals) {
    try {
      const parsed = JSON.parse(raw.reviewIntervals);
      if (Array.isArray(parsed) && validateReviewIntervals(parsed) === null) {
        settings.reviewIntervals = parsed;
      }
    } catch {
      // Corrupted value: keep the default.
    }
  }
  if (raw.useSmartScheduleByDefault !== undefined) {
    settings.useSmartScheduleByDefault = raw.useSmartScheduleByDefault === 'true';
  }
  if (raw.defaultReminderTime && /^\d{2}:\d{2}$/.test(raw.defaultReminderTime)) {
    settings.defaultReminderTime = raw.defaultReminderTime;
  }
  for (const key of ['planMorningTime', 'planDayStart', 'planDayEnd', 'planWorkStart', 'planWorkEnd'] as const) {
    if (raw[key] && /^\d{2}:\d{2}$/.test(raw[key])) {
      settings[key] = raw[key];
    }
  }
  for (const key of ['planMorningReminder', 'planLunchBreak', 'planTaskNotifications'] as const) {
    if (raw[key] !== undefined) {
      settings[key] = raw[key] === 'true';
    }
  }
  return settings;
}

export class SettingsRepository {
  constructor(private readonly db: SqlExecutor) {}

  getAll(): Promise<AppSettings> {
    return withDbError('load settings', async () => {
      const result = await this.db.execute('SELECT key, value FROM settings');
      const raw: Record<string, string> = {};
      for (const row of result.rows) {
        raw[String(row.key)] = String(row.value);
      }
      return parseSettings(raw);
    });
  }

  set<K extends SettingKey>(key: K, value: AppSettings[K]): Promise<void> {
    return withDbError('save settings', async () => {
      const serialized =
        typeof value === 'string' ? value : JSON.stringify(value as unknown);
      await this.db.execute(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, serialized],
      );
    });
  }
}
