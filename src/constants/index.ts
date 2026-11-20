import type { AppSettings, ReminderFrequency } from '../models';

export const DATABASE_NAME = 'my_knowledge_reminder.sqlite';

export const NOTIFICATION_CHANNEL_ID = 'review-reminders';
export const NOTIFICATION_CHANNEL_NAME = 'Review reminders';

export const DEFAULT_REVIEW_INTERVALS = [1, 3, 7, 30];

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'system',
  reviewIntervals: DEFAULT_REVIEW_INTERVALS,
  useSmartScheduleByDefault: true,
  defaultReminderTime: '09:00',
};

export interface DefaultCategory {
  name: string;
  color: string;
  icon: string;
}

/** Seeded by the first migration. Names must stay in sync with migration 001. */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: 'Quran', color: '#0E9F6E', icon: 'book-open-page-variant' },
  { name: 'Hadith', color: '#B7791F', icon: 'script-text-outline' },
  { name: 'Technology', color: '#3F83F8', icon: 'laptop' },
  { name: 'French', color: '#E02424', icon: 'translate' },
  { name: 'Personal Notes', color: '#9061F9', icon: 'notebook-outline' },
  { name: 'Other', color: '#6B7280', icon: 'shape-outline' },
];

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
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  spaced: 'Smart schedule',
};

export const MAX_TITLE_LENGTH = 150;
export const MAX_CONTENT_LENGTH = 20000;
export const MAX_SOURCE_LENGTH = 300;
export const MAX_CATEGORY_NAME_LENGTH = 40;
