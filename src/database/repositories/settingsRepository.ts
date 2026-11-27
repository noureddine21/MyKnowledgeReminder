import {
  DEFAULT_SETTINGS,
  PLAN_BREAK_AFTER_OPTIONS,
  PLAN_BREAK_MINUTES_OPTIONS,
  PLAN_PRAYER_MINUTES_OPTIONS,
  DAILY_GOAL_OPTIONS,
  WORK_NUDGE_EVERY_OPTIONS,
} from '../../constants';
import { CUSTOM_NUDGE_PREFIX, MAX_CUSTOM_NUDGES, isWorkNudgeKey } from '../../services/workNudges';
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
  const goal = Number(raw.dailyGoal);
  if (raw.dailyGoal !== undefined && DAILY_GOAL_OPTIONS.includes(goal)) {
    settings.dailyGoal = goal;
  }
  if (typeof raw.userName === 'string') {
    settings.userName = raw.userName.slice(0, 40);
  }
  if (raw.language === 'system' || raw.language === 'en' || raw.language === 'fr' || raw.language === 'ar') {
    settings.language = raw.language;
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
  for (const key of [
    'planMorningTime',
    'planDayStart',
    'planDayEnd',
    'planWorkStart',
    'planWorkEnd',
    'planLunchStart',
    'planLunchEnd',
    'dailyItemTime',
  ] as const) {
    if (raw[key] && /^\d{2}:\d{2}$/.test(raw[key])) {
      settings[key] = raw[key];
    }
  }
  for (const key of [
    'planMorningReminder',
    'planLunchBreak',
    'planTaskNotifications',
    'planAvoidPrayers',
    'dailyItemEnabled',
    'alarmByDefault',
    'planAlarmByDefault',
  ] as const) {
    if (raw[key] !== undefined) {
      settings[key] = raw[key] === 'true';
    }
  }
  if (raw.planWorkDays) {
    try {
      const days = JSON.parse(raw.planWorkDays);
      if (Array.isArray(days) && days.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) {
        settings.planWorkDays = [...new Set<number>(days)].sort();
      }
    } catch {
      // Corrupted value: keep the default.
    }
  }
  const breakMinutes = Number(raw.planBreakMinutes);
  if (PLAN_BREAK_MINUTES_OPTIONS.includes(breakMinutes)) {
    settings.planBreakMinutes = breakMinutes;
  }
  if (raw.planPrayerCity && /^[a-z]+$/.test(raw.planPrayerCity)) {
    settings.planPrayerCity = raw.planPrayerCity;
  }
  const prayerMinutes = Number(raw.planPrayerMinutes);
  if (PLAN_PRAYER_MINUTES_OPTIONS.includes(prayerMinutes)) {
    settings.planPrayerMinutes = prayerMinutes;
  }
  if (raw.dailyItemSource === 'all' || raw.dailyItemSource === 'faith') {
    settings.dailyItemSource = raw.dailyItemSource;
  }
  const lastBackupAt = Number(raw.lastBackupAt);
  if (Number.isFinite(lastBackupAt) && lastBackupAt > 0) {
    settings.lastBackupAt = lastBackupAt;
  }
  if (raw.planWorkNudges) {
    try {
      const keys = JSON.parse(raw.planWorkNudges);
      if (Array.isArray(keys)) {
        settings.planWorkNudges = [...new Set(keys.filter(isWorkNudgeKey))];
      }
    } catch {
      // Corrupted value: keep the default.
    }
  }
  if (raw.planWorkNudgeCustom) {
    try {
      const keys = JSON.parse(raw.planWorkNudgeCustom);
      if (Array.isArray(keys)) {
        settings.planWorkNudgeCustom = [
          ...new Set(keys.filter(k => isWorkNudgeKey(k) && k.startsWith(CUSTOM_NUDGE_PREFIX))),
        ].slice(0, MAX_CUSTOM_NUDGES);
      }
    } catch {
      // Corrupted value: keep the default.
    }
  }
  const nudgeEvery = Number(raw.planWorkNudgeEveryMin);
  if (WORK_NUDGE_EVERY_OPTIONS.includes(nudgeEvery)) {
    settings.planWorkNudgeEveryMin = nudgeEvery;
  }
  const breakAfter = Number(raw.planBreakAfterMinutes);
  if (PLAN_BREAK_AFTER_OPTIONS.includes(breakAfter)) {
    settings.planBreakAfterMinutes = breakAfter;
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
