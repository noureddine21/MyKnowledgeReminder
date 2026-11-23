import type { ReminderFrequency } from '../models';

const UNITS: Partial<Record<ReminderFrequency, [string, string]>> = {
  hourly: ['hour', 'hours'],
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
};

/** Unit name for a repeating frequency, e.g. ("daily", 3) → "days". */
export function repeatUnit(frequency: ReminderFrequency, interval: number): string {
  const unit = UNITS[frequency];
  if (!unit) {
    return '';
  }
  return interval === 1 ? unit[0] : unit[1];
}

/** "Every hour", "Every 3 days", "Every 2 weeks"… (empty for non-repeating). */
export function formatRecurrence(frequency: ReminderFrequency, interval = 1): string {
  if (!UNITS[frequency]) {
    return '';
  }
  return interval === 1 ? `Every ${repeatUnit(frequency, 1)}` : `Every ${interval} ${repeatUnit(frequency, interval)}`;
}
