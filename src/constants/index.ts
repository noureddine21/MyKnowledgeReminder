import type { AppSettings, ReminderFrequency } from '../models';

export const DATABASE_NAME = 'my_knowledge_reminder.sqlite';

export const NOTIFICATION_CHANNEL_ID = 'review-reminders';
export const NOTIFICATION_CHANNEL_NAME = 'Review reminders';
export const ALARM_CHANNEL_ID = 'review-alarms';
export const ALARM_CHANNEL_NAME = 'Alarms';

export const DEFAULT_REVIEW_INTERVALS = [1, 3, 7, 30];

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'system',
  language: 'system',
  userName: '',
  dailyGoal: 5,
  alarmByDefault: false,
  planAlarmByDefault: false,
  reviewIntervals: DEFAULT_REVIEW_INTERVALS,
  useSmartScheduleByDefault: true,
  defaultReminderTime: '09:00',
  planMorningReminder: true,
  planMorningTime: '07:00',
  planDayStart: '08:00',
  planDayEnd: '22:00',
  planTaskNotifications: true,
  planWorkDays: [1, 2, 3, 4, 5],
  planWorkStart: '09:00',
  planWorkEnd: '17:00',
  planBreakMinutes: 15,
  planBreakAfterMinutes: 120,
  planAvoidPrayers: false,
  planPrayerCity: null,
  planPrayerMinutes: 20,
  dailyItemEnabled: true,
  dailyItemTime: '08:00',
  dailyItemSource: 'all',
  planWorkNudges: [],
  planWorkNudgeEveryMin: 60,
  planWorkNudgeCustom: [],
  lastBackupAt: null,
};

export const DAILY_GOAL_OPTIONS = [0, 3, 5, 10, 15, 20];

export const PLAN_PRAYER_MINUTES_OPTIONS = [10, 15, 20, 30, 45];

/** Choices offered in Settings → Day planner. */
export const PLAN_BREAK_MINUTES_OPTIONS = [0, 10, 15, 20, 30];
export const PLAN_BREAK_AFTER_OPTIONS = [60, 90, 120, 180];
/** How often a small reminder (water, walk...) comes during work hours. */
export const WORK_NUDGE_EVERY_OPTIONS = [30, 60, 90, 120];

export const CATEGORY_COLORS = [
  '#0E9F6E',
  '#B7791F',
  '#3F83F8',
  '#E02424',
  '#9061F9',
  '#6B7280',
  '#E74694',
  '#0694A2',
  '#FF8A4C',
  '#31C48D',
  '#5850EC',
  '#C27803',
];

export const CATEGORY_ICONS = [
  'tag-outline',
  'book-open-page-variant',
  'script-text-outline',
  'laptop',
  'translate',
  'notebook-outline',
  'shape-outline',
  'lightbulb-on-outline',
  'format-quote-open',
  'school-outline',
  'heart-outline',
  'briefcase-outline',
  'flask-outline',
  'music-note',
  'earth',
  'star-outline',
];

export const FREQUENCY_LABELS: Record<ReminderFrequency, string> = {
  once: 'One time',
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  spaced: 'Smart schedule',
};

/** Upper bound for "every N hours/days/weeks/months". */
export const MAX_REPEAT_INTERVAL = 999;

export const MAX_TITLE_LENGTH = 150;
export const MAX_CONTENT_LENGTH = 20000;
export const MAX_SOURCE_LENGTH = 300;
export const MAX_CATEGORY_NAME_LENGTH = 40;

/** DeviceEventEmitter event fired when data changed outside a screen (e.g. a notification action). */
export const DATA_CHANGED_EVENT = 'mkr:data-changed';
