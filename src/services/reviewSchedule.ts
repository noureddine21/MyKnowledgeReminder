/**
 * Pure scheduling logic (no I/O) for reminders and the smart review schedule.
 *
 * Semantics:
 *  - once / spaced: `scheduledAt` is the exact time of the next review.
 *  - daily / weekly / monthly: `scheduledAt` is the anchor of a recurring series;
 *    occurrences are anchor + k * period. The OS keeps firing the repeating
 *    notification, and the app computes occurrences on the fly.
 */
import type { Reminder, ReminderFrequency } from '../models';
import {
  addDays,
  addMonths,
  combineDateAndTime,
  diffInCalendarDays,
  endOfDay,
  startOfDay,
} from '../utils/date';

type RepeatingFrequency = 'daily' | 'weekly' | 'monthly';

export function isRepeating(frequency: ReminderFrequency): frequency is RepeatingFrequency {
  return frequency === 'daily' || frequency === 'weekly' || frequency === 'monthly';
}

export function occurrence(anchor: number, frequency: RepeatingFrequency, index: number): number {
  switch (frequency) {
    case 'daily':
      return addDays(anchor, index);
    case 'weekly':
      return addDays(anchor, index * 7);
    case 'monthly':
      return addMonths(anchor, index);
  }
}

/** Largest k such that occurrence(k) <= t. Assumes anchor <= t. */
function latestIndex(anchor: number, frequency: RepeatingFrequency, t: number): number {
  let k: number;
  if (frequency === 'monthly') {
    const a = new Date(anchor);
    const b = new Date(t);
    k = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  } else {
    const days = diffInCalendarDays(anchor, t);
    k = frequency === 'daily' ? days : Math.floor(days / 7);
  }
  k = Math.max(0, k);
  while (k > 0 && occurrence(anchor, frequency, k) > t) {
    k--;
  }
  while (occurrence(anchor, frequency, k + 1) <= t) {
    k++;
  }
  return k;
}

export function latestOccurrenceOnOrBefore(
  anchor: number,
  frequency: RepeatingFrequency,
  t: number,
): number | null {
  if (anchor > t) {
    return null;
  }
  return occurrence(anchor, frequency, latestIndex(anchor, frequency, t));
}

export function nextOccurrenceAfter(
  anchor: number,
  frequency: RepeatingFrequency,
  after: number,
): number {
  if (anchor > after) {
    return anchor;
  }
  return occurrence(anchor, frequency, latestIndex(anchor, frequency, after) + 1);
}

/** The review moment the user currently owes for this reminder (may be in the past = overdue). */
export function getDueAt(reminder: Reminder, now: number): number | null {
  if (!reminder.isActive) {
    return null;
  }
  if (!isRepeating(reminder.frequency)) {
    return reminder.scheduledAt;
  }
  return (
    latestOccurrenceOnOrBefore(reminder.scheduledAt, reminder.frequency, endOfDay(now)) ??
    reminder.scheduledAt
  );
}

/** True when the item must appear in "Review Today" (due today or overdue, not yet reviewed). */
export function isDueToday(reminder: Reminder, now: number): boolean {
  const dueAt = getDueAt(reminder, now);
  if (dueAt === null || dueAt > endOfDay(now)) {
    return false;
  }
  if (isRepeating(reminder.frequency)) {
    // A review done on the occurrence day (or later) counts for that occurrence.
    return reminder.lastReviewedAt === null || reminder.lastReviewedAt < startOfDay(dueAt);
  }
  return true;
}

export function isOverdue(reminder: Reminder, now: number): boolean {
  const dueAt = getDueAt(reminder, now);
  return dueAt !== null && dueAt < startOfDay(now) && isDueToday(reminder, now);
}

/** Next moment a notification is expected, for display and sorting. */
export function getNextReminderAt(reminder: Reminder, now: number): number | null {
  if (!reminder.isActive) {
    return null;
  }
  if (isRepeating(reminder.frequency)) {
    return nextOccurrenceAfter(reminder.scheduledAt, reminder.frequency, now);
  }
  return reminder.scheduledAt;
}

/**
 * Timestamp for the native trigger, or null if nothing should be scheduled
 * (inactive, or a one-time/spaced reminder already in the past).
 */
export function getNotificationTimestamp(reminder: Reminder, now: number): number | null {
  if (!reminder.isActive) {
    return null;
  }
  if (isRepeating(reminder.frequency)) {
    return nextOccurrenceAfter(reminder.scheduledAt, reminder.frequency, now);
  }
  return reminder.scheduledAt > now ? reminder.scheduledAt : null;
}

/** Date of a spaced review step: base day + interval days, at the time-of-day of `timeRef`. */
export function spacedStepDate(
  baseAt: number,
  intervalDays: number,
  timeRef: number,
): number {
  return combineDateAndTime(addDays(startOfDay(baseAt), intervalDays), timeRef);
}

export function spacedReviewDates(baseAt: number, intervals: number[], timeRef: number): number[] {
  return intervals.map(days => spacedStepDate(baseAt, days, timeRef));
}

/** Earliest future moment at the time-of-day of `timeRef` (today if still ahead, else tomorrow). */
export function nextSlot(timeRef: number, now: number): number {
  const today = combineDateAndTime(now, timeRef);
  return today > now ? today : addDays(today, 1);
}

export interface SpacedSchedule {
  scheduledAt: number;
  step: number;
}

/**
 * Initial spaced schedule: the first step whose date is still in the future.
 * If every step is already in the past (old creation date), the last step is
 * scheduled at the next available slot.
 */
export function initialSpacedSchedule(
  baseAt: number,
  intervals: number[],
  timeRef: number,
  now: number,
): SpacedSchedule | null {
  if (intervals.length === 0) {
    return null;
  }
  for (let step = 0; step < intervals.length; step++) {
    const date = spacedStepDate(baseAt, intervals[step], timeRef);
    if (date > now) {
      return { scheduledAt: date, step };
    }
  }
  return { scheduledAt: nextSlot(timeRef, now), step: intervals.length - 1 };
}

/**
 * Schedule after the user reviewed step `currentStep`.
 * Returns null when the smart schedule is completed.
 * A step whose date already passed (late review) is moved to the next available slot.
 */
export function advanceSpacedSchedule(
  baseAt: number,
  intervals: number[],
  currentStep: number,
  timeRef: number,
  now: number,
): SpacedSchedule | null {
  const step = currentStep + 1;
  if (step >= intervals.length) {
    return null;
  }
  const date = spacedStepDate(baseAt, intervals[step], timeRef);
  return { scheduledAt: date > now ? date : nextSlot(timeRef, now), step };
}
