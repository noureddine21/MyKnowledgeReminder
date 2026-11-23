import {
  MAX_CATEGORY_NAME_LENGTH,
  MAX_REPEAT_INTERVAL,
  MAX_CONTENT_LENGTH,
  MAX_SOURCE_LENGTH,
  MAX_TITLE_LENGTH,
} from '../constants';
import type { InformationInput, ReminderInput } from '../models';
import { ValidationError } from './errors';

export interface ValidationOptions {
  /** When false, a one-time reminder in the past is accepted (e.g. unchanged on edit). */
  requireFutureOnce?: boolean;
}

export function validateInformation(
  input: InformationInput,
  reminder: ReminderInput,
  now: number,
  options: ValidationOptions = {},
): Record<string, string> {
  const requireFutureOnce = options.requireFutureOnce ?? true;
  const errors: Record<string, string> = {};
  const title = input.title.trim();
  const content = input.content.trim();

  if (!title) {
    errors.title = 'Title is required.';
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Title must be at most ${MAX_TITLE_LENGTH} characters.`;
  }
  if (!content) {
    errors.content = 'Content is required.';
  } else if (content.length > MAX_CONTENT_LENGTH) {
    errors.content = `Content must be at most ${MAX_CONTENT_LENGTH} characters.`;
  }
  if (input.source && input.source.trim().length > MAX_SOURCE_LENGTH) {
    errors.source = `Source must be at most ${MAX_SOURCE_LENGTH} characters.`;
  }
  if (!Number.isFinite(input.createdAt)) {
    errors.createdAt = 'Creation date is invalid.';
  }
  if (reminder.enabled) {
    if (!Number.isFinite(reminder.scheduledAt)) {
      errors.reminder = 'Reminder date is invalid.';
    } else if (requireFutureOnce && reminder.frequency === 'once' && reminder.scheduledAt <= now) {
      errors.reminder = 'A one-time reminder must be in the future.';
    }
    const repeating = ['hourly', 'daily', 'weekly', 'monthly'].includes(reminder.frequency);
    const interval = reminder.repeatInterval ?? 1;
    if (repeating && (!Number.isInteger(interval) || interval < 1 || interval > MAX_REPEAT_INTERVAL)) {
      errors.repeatInterval = `Enter a whole number between 1 and ${MAX_REPEAT_INTERVAL}.`;
    }
  }
  return errors;
}

export function assertValidInformation(
  input: InformationInput,
  reminder: ReminderInput,
  now: number,
  options: ValidationOptions = {},
): void {
  const errors = validateInformation(input, reminder, now, options);
  if (Object.keys(errors).length > 0) {
    throw new ValidationError(errors);
  }
}

export function validateCategoryName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Category name is required.';
  }
  if (trimmed.length > MAX_CATEGORY_NAME_LENGTH) {
    return `Category name must be at most ${MAX_CATEGORY_NAME_LENGTH} characters.`;
  }
  return null;
}

/** Validates the smart-schedule intervals: positive whole days, strictly increasing. */
export function validateReviewIntervals(intervals: number[]): string | null {
  if (intervals.length === 0) {
    return 'Add at least one review interval.';
  }
  if (intervals.length > 12) {
    return 'Use at most 12 review intervals.';
  }
  for (let i = 0; i < intervals.length; i++) {
    const value = intervals[i];
    if (!Number.isInteger(value) || value < 1 || value > 3650) {
      return 'Each interval must be a whole number of days between 1 and 3650.';
    }
    if (i > 0 && value <= intervals[i - 1]) {
      return 'Intervals must be in increasing order (e.g. 1, 3, 7, 30).';
    }
  }
  return null;
}

/** Parses "1, 3, 7, 30" into numbers. Returns null if any part is not a number. */
export function parseIntervals(text: string): number[] | null {
  const parts = text
    .split(/[,\s]+/)
    .map(p => p.trim())
    .filter(Boolean);
  const numbers = parts.map(Number);
  return numbers.some(n => Number.isNaN(n)) ? null : numbers;
}
