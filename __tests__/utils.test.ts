import {
  buildReminderMessage,
  informationIdFromData,
  notificationIdFor,
} from '../src/services/notificationService/messages';
import { addMonths, applyTimeString, diffInCalendarDays, formatRelative, toTimeString } from '../src/utils/date';
import {
  parseIntervals,
  validateCategoryName,
  validateInformation,
  validateReviewIntervals,
} from '../src/utils/validation';

const at = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('date utils', () => {
  it('adds months with day clamping', () => {
    expect(addMonths(at(2024, 1, 31), 1)).toBe(at(2024, 2, 29));
    expect(addMonths(at(2026, 12, 15), 2)).toBe(at(2027, 2, 15));
  });

  it('applies "HH:mm" strings with a safe fallback', () => {
    expect(toTimeString(applyTimeString(at(2026, 1, 1), '18:45'))).toBe('18:45');
    expect(toTimeString(applyTimeString(at(2026, 1, 1), 'oops'))).toBe('09:00');
  });

  it('formats relative dates', () => {
    const now = at(2026, 1, 10, 12);
    expect(formatRelative(at(2026, 1, 10, 18), now)).toBe('Today, 18:00');
    expect(formatRelative(at(2026, 1, 11, 9), now)).toBe('Tomorrow, 09:00');
    expect(formatRelative(at(2026, 1, 13), now)).toBe('In 3 days');
    expect(formatRelative(at(2026, 1, 7), now)).toBe('3 days ago');
    expect(diffInCalendarDays(at(2026, 1, 10, 23), at(2026, 1, 11, 1))).toBe(1);
  });
});

describe('validation', () => {
  const now = at(2026, 1, 10);
  const base = { title: 'Ayat al-Kursi', content: 'Allah! There is no deity except Him…', categoryId: 1, source: null, createdAt: now };
  const reminder = { enabled: true, frequency: 'once' as const, scheduledAt: at(2026, 1, 11) };

  it('accepts valid input', () => {
    expect(validateInformation(base, reminder, now)).toEqual({});
  });

  it('requires title and content', () => {
    const errors = validateInformation({ ...base, title: '  ', content: '' }, reminder, now);
    expect(errors.title).toBeDefined();
    expect(errors.content).toBeDefined();
  });

  it('rejects one-time reminders in the past unless allowed', () => {
    const past = { ...reminder, scheduledAt: at(2026, 1, 9) };
    expect(validateInformation(base, past, now).reminder).toBeDefined();
    expect(validateInformation(base, past, now, { requireFutureOnce: false }).reminder).toBeUndefined();
    expect(validateInformation(base, { ...past, enabled: false }, now).reminder).toBeUndefined();
  });

  it('validates review intervals', () => {
    expect(validateReviewIntervals([1, 3, 7, 30])).toBeNull();
    expect(validateReviewIntervals([])).not.toBeNull();
    expect(validateReviewIntervals([3, 1])).not.toBeNull();
    expect(validateReviewIntervals([0, 2])).not.toBeNull();
    expect(validateReviewIntervals([1.5])).not.toBeNull();
    expect(parseIntervals('1, 3 ,7,30')).toEqual([1, 3, 7, 30]);
    expect(parseIntervals('1, a')).toBeNull();
  });

  it('validates category names', () => {
    expect(validateCategoryName('Arabic')).toBeNull();
    expect(validateCategoryName('   ')).not.toBeNull();
    expect(validateCategoryName('x'.repeat(41))).not.toBeNull();
  });
});

describe('notification messages', () => {
  it('adapts the text to the category', () => {
    expect(buildReminderMessage('Ayat al-Kursi', 'Quran').body).toBe(
      'Time to review your saved Quran verse: Ayat al-Kursi',
    );
    expect(buildReminderMessage('Azure Artifacts', 'Technology').body).toBe('Remember your Azure Artifacts notes.');
    expect(buildReminderMessage('Idea', null).title).toBe('Time to review!');
  });

  it('round-trips the information id', () => {
    expect(notificationIdFor(42)).toBe('info-42');
    expect(informationIdFromData({ informationId: '42' })).toBe(42);
    expect(informationIdFromData({ informationId: 'abc' })).toBeNull();
    expect(informationIdFromData(undefined)).toBeNull();
  });
});
