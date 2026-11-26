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
}

/** Fields the user edits in the Add / Edit form. */
export interface InformationInput {
  title: string;
  content: string;
  categoryId: number | null;
  source: string | null;
  createdAt: number;
}

/** Reminder configuration chosen in the form. */
export interface ReminderInput {
  enabled: boolean;
  frequency: ReminderFrequency;
  /** Repeating reminders: every N units (defaults to 1). */
  repeatInterval?: number;
  /** Date + time of the first reminder (for spaced, only the time-of-day is used). */
  scheduledAt: number;
}

export interface AppSettings {
  themeMode: ThemeMode;
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
}

export interface DayPlan {
  planDate: string;
  rawInput: string;
  tasks: PlanTask[];
  updatedAt: number;
}

export type SortOption = 'createdDesc' | 'createdAsc' | 'nextReminder';

export interface InformationQuery {
  search?: string;
  categoryId?: number | null;
  sort?: SortOption;
}
