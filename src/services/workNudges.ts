/**
 * Small healthy reminders during work hours ("Drink water", "Walk a bit"...).
 * The planner never puts tasks in work hours; these short nudges are the exception:
 * one notification every N minutes, cycling through the chosen ones.
 * Pure logic only (scheduling lives in notificationService/planNotifications).
 */
import type { DayWindow } from '../models';
import { applyTimeString } from '../utils/date';

export interface WorkNudge {
  key: string;
  emoji: string;
  icon: string;
  label: string;
  body: string;
}

export const WORK_NUDGES: WorkNudge[] = [
  { key: 'water', emoji: '💧', icon: 'cup-water', label: 'Drink water', body: 'A glass of water keeps you focused.' },
  { key: 'walk', emoji: '🚶', icon: 'walk', label: 'Walk a little', body: 'Stand up and walk for 2–3 minutes.' },
  { key: 'stretch', emoji: '🧘', icon: 'human-handsup', label: 'Stretch', body: 'Stretch your neck, back and shoulders.' },
  { key: 'eyes', emoji: '👀', icon: 'eye-outline', label: 'Rest your eyes', body: 'Look far away for 20 seconds.' },
  { key: 'learn', emoji: '📖', icon: 'book-open-variant', label: 'Read / learn', body: 'Read one item of your library (2 min).' },
  { key: 'dhikr', emoji: '📿', icon: 'hands-pray', label: 'Dhikr', body: 'A minute of dhikr: SubhanAllah, Alhamdulillah, Allahu Akbar.' },
];

/** Reminders written by the user are stored as "custom:<label>". */
export const CUSTOM_NUDGE_PREFIX = 'custom:';
export const MAX_CUSTOM_NUDGE_LENGTH = 40;
export const MAX_CUSTOM_NUDGES = 10;

export function customNudgeKey(label: string): string {
  return `${CUSTOM_NUDGE_PREFIX}${label.trim().replace(/\s+/g, ' ').slice(0, MAX_CUSTOM_NUDGE_LENGTH)}`;
}

function customLabel(key: string): string | null {
  if (!key.startsWith(CUSTOM_NUDGE_PREFIX)) {
    return null;
  }
  const label = key.slice(CUSTOM_NUDGE_PREFIX.length).trim();
  return label && label.length <= MAX_CUSTOM_NUDGE_LENGTH ? label : null;
}

export function isWorkNudgeKey(key: unknown): key is string {
  return typeof key === 'string' && (WORK_NUDGES.some(n => n.key === key) || customLabel(key) !== null);
}

export function workNudge(key: string): WorkNudge | undefined {
  const builtIn = WORK_NUDGES.find(n => n.key === key);
  if (builtIn) {
    return builtIn;
  }
  const label = customLabel(key);
  return label ? { key, emoji: '🔔', icon: 'bell-outline', label, body: 'Your reminder during work.' } : undefined;
}

export interface NudgeSlot {
  at: number;
  key: string;
}

/**
 * Nudge times for one day: every `everyMin` after work starts, before work ends,
 * outside the lunch break, cycling through `keys`. Only slots after `now`.
 */
export function workNudgeSlots(
  day: number,
  window: Pick<DayWindow, 'workStart' | 'workEnd'>,
  keys: string[],
  everyMin: number,
  lunch: { start: string; end: string } | null,
  now: number,
): NudgeSlot[] {
  const valid = keys.filter(isWorkNudgeKey);
  if (!window.workStart || !window.workEnd || valid.length === 0 || everyMin < 15) {
    return [];
  }
  const start = applyTimeString(day, window.workStart);
  const end = applyTimeString(day, window.workEnd);
  const lunchStart = lunch ? applyTimeString(day, lunch.start) : 0;
  const lunchEnd = lunch ? applyTimeString(day, lunch.end) : 0;
  const slots: NudgeSlot[] = [];
  let index = 0;
  for (let at = start + everyMin * 60_000; at < end - 5 * 60_000; at += everyMin * 60_000) {
    if (lunch && at >= lunchStart && at < lunchEnd) {
      continue;
    }
    const key = valid[index % valid.length];
    index += 1;
    if (at > now) {
      slots.push({ at, key });
    }
  }
  return slots;
}
