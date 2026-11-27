import type { Reminder } from '../src/models';
import {
  advanceSpacedSchedule,
  getDueAt,
  getNextReminderAt,
  getNotificationTimestamp,
  initialSpacedSchedule,
  isDueToday,
  isOverdue,
  latestOccurrenceOnOrBefore,
  nextOccurrenceAfter,
  spacedReviewDates,
} from '../src/services/reviewSchedule';

const at = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min).getTime();

function reminder(patch: Partial<Reminder>): Reminder {
  return {
    id: 1,
    informationId: 1,
    scheduledAt: at(2026, 1, 10),
    frequency: 'once',
    repeatInterval: 1,
    alarm: false,
    isActive: true,
    notificationId: null,
    spacedStep: 0,
    spacedBaseAt: null,
    lastReviewedAt: null,
    createdAt: at(2026, 1, 1),
    updatedAt: at(2026, 1, 1),
    ...patch,
  };
}

describe('recurring occurrences', () => {
  it('finds the next daily occurrence after a moment', () => {
    const anchor = at(2026, 1, 10, 9);
    expect(nextOccurrenceAfter(anchor, 'daily', at(2026, 1, 15, 10))).toBe(at(2026, 1, 16, 9));
    expect(nextOccurrenceAfter(anchor, 'daily', at(2026, 1, 15, 8))).toBe(at(2026, 1, 15, 9));
    expect(nextOccurrenceAfter(anchor, 'daily', at(2026, 1, 1))).toBe(anchor);
  });

  it('handles weekly occurrences', () => {
    const anchor = at(2026, 1, 5, 18); // Monday
    expect(nextOccurrenceAfter(anchor, 'weekly', at(2026, 1, 6))).toBe(at(2026, 1, 12, 18));
    expect(latestOccurrenceOnOrBefore(anchor, 'weekly', at(2026, 1, 20))).toBe(at(2026, 1, 19, 18));
    expect(latestOccurrenceOnOrBefore(anchor, 'weekly', at(2026, 1, 4))).toBeNull();
  });

  it('clamps monthly occurrences to the end of shorter months', () => {
    const anchor = at(2026, 1, 31, 9);
    expect(nextOccurrenceAfter(anchor, 'monthly', at(2026, 2, 1))).toBe(at(2026, 2, 28, 9));
    expect(nextOccurrenceAfter(anchor, 'monthly', at(2026, 3, 1))).toBe(at(2026, 3, 31, 9));
    expect(latestOccurrenceOnOrBefore(anchor, 'monthly', at(2026, 4, 15))).toBe(at(2026, 3, 31, 9));
  });
});

describe('due today', () => {
  const now = at(2026, 1, 10, 12);

  it('one-time reminder due today or overdue', () => {
    expect(isDueToday(reminder({ scheduledAt: at(2026, 1, 10, 20) }), now)).toBe(true);
    expect(isDueToday(reminder({ scheduledAt: at(2026, 1, 8) }), now)).toBe(true);
    expect(isOverdue(reminder({ scheduledAt: at(2026, 1, 8) }), now)).toBe(true);
    expect(isDueToday(reminder({ scheduledAt: at(2026, 1, 11) }), now)).toBe(false);
    expect(isDueToday(reminder({ scheduledAt: at(2026, 1, 9), isActive: false }), now)).toBe(false);
  });

  it('daily reminder is due every day until reviewed that day', () => {
    const daily = reminder({ frequency: 'daily', scheduledAt: at(2026, 1, 1, 20) });
    expect(getDueAt(daily, now)).toBe(at(2026, 1, 10, 20));
    expect(isDueToday(daily, now)).toBe(true);
    expect(isOverdue(daily, now)).toBe(false);
    // Reviewed this morning, before today's 20:00 occurrence: counts for today.
    expect(isDueToday({ ...daily, lastReviewedAt: at(2026, 1, 10, 8) }, now)).toBe(false);
    // Reviewed yesterday: due again today.
    expect(isDueToday({ ...daily, lastReviewedAt: at(2026, 1, 9, 21) }, now)).toBe(true);
  });

  it('weekly reminder not reviewed since its last occurrence is overdue', () => {
    const weekly = reminder({ frequency: 'weekly', scheduledAt: at(2026, 1, 5, 9) });
    expect(isDueToday(weekly, now)).toBe(true);
    expect(isOverdue(weekly, now)).toBe(true);
    expect(isDueToday({ ...weekly, lastReviewedAt: at(2026, 1, 6) }, now)).toBe(false);
  });

  it('future recurring series is not due', () => {
    expect(isDueToday(reminder({ frequency: 'daily', scheduledAt: at(2026, 1, 12) }), now)).toBe(false);
  });
});

describe('notification timestamps', () => {
  const now = at(2026, 1, 10, 12);

  it('does not schedule past one-time reminders', () => {
    expect(getNotificationTimestamp(reminder({ scheduledAt: at(2026, 1, 9) }), now)).toBeNull();
    expect(getNotificationTimestamp(reminder({ scheduledAt: at(2026, 1, 11) }), now)).toBe(at(2026, 1, 11));
  });

  it('schedules recurring reminders at their next future occurrence', () => {
    const daily = reminder({ frequency: 'daily', scheduledAt: at(2026, 1, 1, 9) });
    expect(getNotificationTimestamp(daily, now)).toBe(at(2026, 1, 11, 9));
    expect(getNextReminderAt(daily, now)).toBe(at(2026, 1, 11, 9));
  });

  it('inactive reminders are never scheduled', () => {
    expect(getNotificationTimestamp(reminder({ isActive: false, scheduledAt: at(2026, 2, 1) }), now)).toBeNull();
    expect(getNextReminderAt(reminder({ isActive: false }), now)).toBeNull();
  });
});

describe('smart (spaced) schedule', () => {
  const intervals = [1, 3, 7, 30];
  const created = at(2026, 1, 10, 15);
  const timeRef = at(2000, 1, 1, 9);

  it('computes review dates relative to the creation day', () => {
    expect(spacedReviewDates(created, intervals, timeRef)).toEqual([
      at(2026, 1, 11, 9),
      at(2026, 1, 13, 9),
      at(2026, 1, 17, 9),
      at(2026, 2, 9, 9),
    ]);
  });

  it('starts at the first future step', () => {
    expect(initialSpacedSchedule(created, intervals, timeRef, at(2026, 1, 10, 16))).toEqual({
      scheduledAt: at(2026, 1, 11, 9),
      step: 0,
    });
    // Item created in the past: steps already passed are skipped.
    expect(initialSpacedSchedule(created, intervals, timeRef, at(2026, 1, 14, 10))).toEqual({
      scheduledAt: at(2026, 1, 17, 9),
      step: 2,
    });
  });

  it('schedules the last step at the next slot when every date has passed', () => {
    expect(initialSpacedSchedule(created, intervals, timeRef, at(2026, 6, 1, 10))).toEqual({
      scheduledAt: at(2026, 6, 2, 9),
      step: 3,
    });
  });

  it('advances to the next step and completes after the last one', () => {
    expect(advanceSpacedSchedule(created, intervals, 0, timeRef, at(2026, 1, 11, 9, 5))).toEqual({
      scheduledAt: at(2026, 1, 13, 9),
      step: 1,
    });
    expect(advanceSpacedSchedule(created, intervals, 3, timeRef, at(2026, 2, 9, 10))).toBeNull();
  });

  it('moves a late step to the next available slot', () => {
    // Step 1 (Jan 13) reviewed late on Jan 20 at 08:00 → step 2 (Jan 17) already passed.
    expect(advanceSpacedSchedule(created, intervals, 1, timeRef, at(2026, 1, 20, 8))).toEqual({
      scheduledAt: at(2026, 1, 20, 9),
      step: 2,
    });
  });
});
