import { getRepositories, inTransaction, type CategoryWithCount } from '../database/repositories';
import type { InformationItem } from '../models';
import { addDays, applyTimeString, endOfDay, startOfDay, toTimeString } from '../utils/date';
import { NotFoundError, ValidationError } from '../utils/errors';
import { syncItemNotification } from './reminderSync';
import {
  advanceSpacedSchedule,
  getDueAt,
  getNextReminderAt,
  isDueToday,
  isRepeating,
} from './reviewSchedule';

export interface DueItem {
  item: InformationItem;
  dueAt: number;
  overdue: boolean;
}

export interface UpcomingItem {
  item: InformationItem;
  nextAt: number;
}

export interface DashboardData {
  total: number;
  dueToday: DueItem[];
  upcoming: UpcomingItem[];
  recent: InformationItem[];
  categories: CategoryWithCount[];
  reviewedToday: number;
  activeReminders: number;
}

function computeDue(items: InformationItem[], now: number): DueItem[] {
  const due: DueItem[] = [];
  for (const item of items) {
    if (item.reminder && isDueToday(item.reminder, now)) {
      const dueAt = getDueAt(item.reminder, now) ?? now;
      due.push({ item, dueAt, overdue: dueAt < startOfDay(now) });
    }
  }
  return due.sort((a, b) => a.dueAt - b.dueAt);
}

export async function getDueToday(now: number = Date.now()): Promise<DueItem[]> {
  const repos = await getRepositories();
  return computeDue(await repos.information.findWithActiveReminder(), now);
}

export async function getDashboard(now: number = Date.now()): Promise<DashboardData> {
  const repos = await getRepositories();
  const [total, active, recent, categories, reviewedToday] = await Promise.all([
    repos.information.count(),
    repos.information.findWithActiveReminder(),
    repos.information.findAll({ sort: 'createdDesc', limit: 5 }),
    repos.categories.findAllWithCounts(),
    repos.reviewHistory.countReviewedBetween(startOfDay(now), endOfDay(now)),
  ]);

  const dueToday = computeDue(active, now);
  const upcoming: UpcomingItem[] = [];
  for (const item of active) {
    const nextAt = item.reminder ? getNextReminderAt(item.reminder, now) : null;
    if (nextAt !== null && nextAt > now) {
      upcoming.push({ item, nextAt });
    }
  }
  upcoming.sort((a, b) => a.nextAt - b.nextAt);

  return {
    total,
    dueToday,
    upcoming: upcoming.slice(0, 5),
    recent,
    categories,
    reviewedToday,
    activeReminders: active.length,
  };
}

export interface ReviewResult {
  /** True when the reminder has no further reviews (one-time, or smart schedule finished). */
  completed: boolean;
  nextAt: number | null;
  warning: string | null;
}

/** Records a review and moves the reminder to its next state. */
export async function markReviewed(
  informationId: number,
  now: number = Date.now(),
  options: { extraSteps?: number } = {},
): Promise<ReviewResult> {
  const repos = await getRepositories();
  const item = await repos.information.findById(informationId);
  if (!item) {
    throw new NotFoundError('This information');
  }
  const settings = await repos.settings.getAll();
  const reminder = item.reminder;
  let completed = false;
  let nextAt: number | null = null;

  await inTransaction(async tx => {
    await tx.reviewHistory.add(informationId, 'reviewed', now);
    if (!reminder || !reminder.isActive) {
      return;
    }
    if (reminder.frequency === 'once') {
      completed = true;
      await tx.reminders.updateSchedule(
        reminder.id,
        { scheduledAt: reminder.scheduledAt, isActive: false, spacedStep: reminder.spacedStep, lastReviewedAt: now },
        now,
      );
    } else if (isRepeating(reminder.frequency)) {
      await tx.reminders.updateSchedule(
        reminder.id,
        { scheduledAt: reminder.scheduledAt, isActive: true, spacedStep: reminder.spacedStep, lastReviewedAt: now },
        now,
      );
      nextAt = getNextReminderAt({ ...reminder, lastReviewedAt: now }, now);
    } else {
      const next = advanceSpacedSchedule(
        reminder.spacedBaseAt ?? item.createdAt,
        settings.reviewIntervals,
        // "Easy" in the quiz skips ahead in the smart schedule.
        reminder.spacedStep + Math.max(0, options.extraSteps ?? 0),
        reminder.scheduledAt,
        now,
      );
      completed = next === null;
      nextAt = next?.scheduledAt ?? null;
      await tx.reminders.updateSchedule(
        reminder.id,
        {
          scheduledAt: next?.scheduledAt ?? reminder.scheduledAt,
          isActive: next !== null,
          spacedStep: next?.step ?? reminder.spacedStep,
          lastReviewedAt: now,
        },
        now,
      );
    }
  });

  const warning = await syncItemNotification(informationId, now, { clearSnooze: true });
  return { completed, nextAt, warning };
}

/**
 * "Schedule another review": moves the next review to a chosen date/time.
 * For recurring reminders the series restarts from that moment.
 * Items without a reminder get a one-time reminder.
 */
export async function rescheduleReview(
  informationId: number,
  at: number,
  now: number = Date.now(),
): Promise<string | null> {
  if (!Number.isFinite(at) || at <= now) {
    throw new ValidationError({ reminder: 'Choose a date and time in the future.' });
  }
  const repos = await getRepositories();
  const item = await repos.information.findById(informationId);
  if (!item) {
    throw new NotFoundError('This information');
  }

  await inTransaction(async tx => {
    const reminder = item.reminder;
    if (reminder) {
      await tx.reminders.updateSchedule(
        reminder.id,
        {
          scheduledAt: at,
          isActive: true,
          spacedStep: reminder.spacedStep,
          lastReviewedAt: reminder.lastReviewedAt,
        },
        now,
      );
    } else {
      await tx.reminders.upsert(
        informationId,
        { scheduledAt: at, frequency: 'once', repeatInterval: 1, isActive: true, spacedStep: 0, spacedBaseAt: null },
        now,
      );
    }
    await tx.reviewHistory.add(informationId, 'rescheduled', now);
  });

  return syncItemNotification(informationId, now, { clearSnooze: true });
}

/** Activates or deactivates the reminder of an item. */
export async function setReminderActive(
  informationId: number,
  active: boolean,
  now: number = Date.now(),
): Promise<string | null> {
  const repos = await getRepositories();
  const reminder = await repos.reminders.findByInformationId(informationId);
  if (!reminder) {
    throw new NotFoundError('The reminder');
  }
  if (active && !isRepeating(reminder.frequency) && reminder.scheduledAt <= now) {
    throw new ValidationError({
      reminder: 'This reminder date has already passed. Please schedule a new review date.',
    });
  }
  await repos.reminders.setActive(reminder.id, active, now);
  return syncItemNotification(informationId, now);
}

export type QuizGrade = 'hard' | 'good' | 'easy';

/**
 * "Hard" in the quiz: the review counts, but the item comes back tomorrow
 * (same time of day). Repeating reminders keep their series.
 */
export async function reviewHard(informationId: number, now: number = Date.now()): Promise<ReviewResult> {
  const repos = await getRepositories();
  const item = await repos.information.findById(informationId);
  if (!item) {
    throw new NotFoundError('This information');
  }
  const settings = await repos.settings.getAll();
  const reminder = item.reminder;
  const time = reminder ? toTimeString(reminder.scheduledAt) : settings.defaultReminderTime;
  const tomorrow = applyTimeString(addDays(now, 1), time);
  let nextAt: number | null = tomorrow;

  await inTransaction(async tx => {
    await tx.reviewHistory.add(informationId, 'reviewed', now);
    if (reminder && isRepeating(reminder.frequency) && reminder.isActive) {
      await tx.reminders.updateSchedule(
        reminder.id,
        { scheduledAt: reminder.scheduledAt, isActive: true, spacedStep: reminder.spacedStep, lastReviewedAt: now },
        now,
      );
      nextAt = getNextReminderAt({ ...reminder, lastReviewedAt: now }, now);
    } else if (reminder) {
      await tx.reminders.updateSchedule(
        reminder.id,
        { scheduledAt: tomorrow, isActive: true, spacedStep: reminder.spacedStep, lastReviewedAt: now },
        now,
      );
    } else {
      await tx.reminders.upsert(
        informationId,
        { scheduledAt: tomorrow, frequency: 'once', repeatInterval: 1, isActive: true, spacedStep: 0, spacedBaseAt: null },
        now,
      );
    }
  });

  const warning = await syncItemNotification(informationId, now, { clearSnooze: true });
  return { completed: false, nextAt, warning };
}

/** Applies a quiz answer: hard = again tomorrow, good = normal review, easy = skip ahead. */
export function gradeReview(informationId: number, grade: QuizGrade, now: number = Date.now()): Promise<ReviewResult> {
  if (grade === 'hard') {
    return reviewHard(informationId, now);
  }
  return markReviewed(informationId, now, { extraSteps: grade === 'easy' ? 1 : 0 });
}

/** Practice outside the schedule: only recorded in the history (statistics). */
export async function recordPractice(informationId: number, now: number = Date.now()): Promise<void> {
  const repos = await getRepositories();
  await repos.reviewHistory.add(informationId, 'reviewed', now);
}
