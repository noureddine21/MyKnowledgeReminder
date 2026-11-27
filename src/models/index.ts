/**
 * Domain models shared by the database layer, services and UI.
 * All timestamps are stored and handled as epoch milliseconds (local device clock).
 */

export type ReminderFrequency = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'spaced';

export const REMINDER_FREQUENCIES: ReminderFrequency[] = [
  'once',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'spaced',
];

export type ReviewStatus = 'reviewed' | 'rescheduled';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string;
  isDefault: boolean;
  createdAt: number;
}

export interface Information {
  id: number;
  title: string;
  content: string;
  categoryId: number | null;
  source: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Reminder {
  id: number;
  informationId: number;
  /**
   * once / spaced: the exact moment of the next review.
   * hourly / daily / weekly / monthly: the anchor (first occurrence) of the recurring series.
   */
  scheduledAt: number;
  frequency: ReminderFrequency;
  /** Repeating reminders: every N hours/days/weeks/months (1 = every hour/day/...). */
  repeatInterval: number;
  /** Alarm mode: rings until the user answers, full screen, cannot be swiped away. */
  alarm: boolean;
  isActive: boolean;
  notificationId: string | null;
  /** Index of the next interval to use in the smart (spaced) schedule. */
  spacedStep: number;
  /** Base date used to compute spaced reviews ("N days after creation"). */
  spacedBaseAt: number | null;
  lastReviewedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewHistoryEntry {
  id: number;
  informationId: number;
  reviewedAt: number;
  status: ReviewStatus;
}

/** Information enriched with its category and reminder, used by most screens. */
export interface InformationItem extends Information {
  category: Category | null;
  reminder: Reminder | null;
  /** Loaded by the service layer (empty when not loaded). */
  tags?: Tag[];
}

/** Free tag for finer organization ("#tafsir", "#exam"…); an item can have several. */
export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface TagWithCount extends Tag {
  itemCount: number;
}

/** Fields the user edits in the Add / Edit form. */
export interface InformationInput {
  title: string;
  content: string;
  categoryId: number | null;
  source: string | null;
  createdAt: number;
  /** When provided, replaces the item's tags. */
  tagIds?: number[];
}

/** Reminder configuration chosen in the form. */
export interface ReminderInput {
  enabled: boolean;
  frequency: ReminderFrequency;
  /** Repeating reminders: every N units (defaults to 1). */
  repeatInterval?: number;
  /** Alarm mode (defaults to off). */
  alarm?: boolean;
  /** Date + time of the first reminder (for spaced, only the time-of-day is used). */
  scheduledAt: number;
}

export interface AppSettings {
  themeMode: ThemeMode;
  /** Alarm mode pre-selected for new items / for day-plan tasks. */
  alarmByDefault: boolean;
  planAlarmByDefault: boolean;
  /** Daily goal: number of reviews per day (0 = no goal). */
  dailyGoal: number;
  /** First name shown in the home greeting (optional). */
  userName: string;
  /** Interface language ('system' follows the phone). */
  language: 'system' | 'en' | 'fr' | 'ar';
  /** Smart review schedule intervals in days after creation, e.g. [1, 3, 7, 30]. */
  reviewIntervals: number[];
  /** Pre-select the smart schedule in the Add form. */
  useSmartScheduleByDefault: boolean;
  /** Default time-of-day for new reminders, "HH:mm". */
  defaultReminderTime: string;
  /** Day planner: daily notification asking to enter today's to-do list. */
  planMorningReminder: boolean;
  /** Time of the morning reminder, "HH:mm". */
  planMorningTime: string;
  /** Working window used to organize the day, "HH:mm". */
  planDayStart: string;
  planDayEnd: string;
  /** Keep 12:30–13:30 free. */
  planLunchBreak: boolean;
  /** Notify when each planned task starts. */
  planTaskNotifications: boolean;
  /** Work schedule: days of the week (0 = Sunday … 6 = Saturday) and hours ("HH:mm"). */
  planWorkDays: number[];
  planWorkStart: string;
  planWorkEnd: string;
  /** Lunch break kept free when `planLunchBreak` is on ("HH:mm"). */
  planLunchStart: string;
  planLunchEnd: string;
  /** Short break of `planBreakMinutes` after `planBreakAfterMinutes` of continuous tasks (0 = no break). */
  planBreakMinutes: number;
  planBreakAfterMinutes: number;
  /** Day planner: never plan tasks during prayers (times calculated offline for this city). */
  planAvoidPrayers: boolean;
  planPrayerCity: string | null;
  /** Minutes kept free from each prayer time (Jumu'ah: at least 60). */
  planPrayerMinutes: number;
  /** "Item of the day" notification: on/off, time ("HH:mm") and which items. */
  dailyItemEnabled: boolean;
  dailyItemTime: string;
  dailyItemSource: 'all' | 'faith';
  /** Small reminders during work hours (keys of WORK_NUDGES: water, walk...), cycled. */
  planWorkNudges: string[];
  planWorkNudgeEveryMin: number;
  /** When the last backup file was saved (epoch ms), or null. */
  lastBackupAt: number | null;
}

/** Time window of a planned day ("HH:mm"); work hours are null on a day off. */
export interface DayWindow {
  dayStart: string;
  dayEnd: string;
  workStart: string | null;
  workEnd: string | null;
}

/** One task of a day plan, as stored. */
export interface PlanTask {
  id: number;
  /** Local date "YYYY-MM-DD". */
  planDate: string;
  title: string;
  durationMin: number;
  /** Fixed start chosen by the user ("@14:00"), minutes after midnight. */
  fixedStartMin: number | null;
  important: boolean;
  /** Order in the user's list. */
  position: number;
  /** Organized time slot; null when it did not fit in the day. */
  startAt: number | null;
  endAt: number | null;
  isDone: boolean;
  doneAt: number | null;
  /** Alarm mode for the task start. */
  alarm: boolean;
}

export interface DayPlan {
  planDate: string;
  rawInput: string;
  tasks: PlanTask[];
  updatedAt: number;
  /** Window chosen for this day (null for plans saved before it existed). */
  window: DayWindow | null;
}

export type SortOption = 'createdDesc' | 'createdAsc' | 'nextReminder';

export interface InformationQuery {
  search?: string;
  categoryId?: number | null;
  tagId?: number | null;
  sort?: SortOption;
}

/** A task repeated on some weekdays, added automatically to the day plan. */
export interface Routine {
  id: number;
  title: string;
  durationMin: number;
  fixedStartMin: number | null;
  important: boolean;
  /** Weekdays, 0 = Sunday … 6 = Saturday. */
  days: number[];
  isActive: boolean;
  /** Alarm mode for the task created from this routine. */
  alarm: boolean;
  createdAt: number;
}

export type RoutineInput = Omit<Routine, 'id' | 'createdAt'>;
