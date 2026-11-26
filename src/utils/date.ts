import { tr } from '../i18n';
/**
 * Small, dependency-free date helpers working with epoch milliseconds in local time.
 */

export const MS_PER_MINUTE = 60 * 1000;
export const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Calendar-aware: keeps the wall-clock time across DST changes. */
export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Adds calendar months, clamping the day (Jan 31 + 1 month -> Feb 28/29). */
export function addMonths(ts: number, months: number): number {
  const d = new Date(ts);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.getTime();
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** Number of calendar days between two timestamps (b - a). */
export function diffInCalendarDays(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / MS_PER_DAY);
}

/** Returns `dateTs` with the hours/minutes taken from `timeTs`. */
export function combineDateAndTime(dateTs: number, timeTs: number): number {
  const date = new Date(dateTs);
  const time = new Date(timeTs);
  date.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return date.getTime();
}

/** Parses "HH:mm" and applies it to the given day. Invalid input falls back to 09:00. */
export function applyTimeString(dateTs: number, time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  let hours = 9;
  let minutes = 0;
  if (match) {
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      hours = h;
      minutes = m;
    }
  }
  const d = new Date(dateTs);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

export function toTimeString(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${tr(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
}

export function formatTime(ts: number): string {
  return toTimeString(ts);
}

export function formatDateTime(ts: number): string {
  return `${formatDate(ts)}, ${formatTime(ts)}`;
}

export function formatLongToday(now: number): string {
  const d = new Date(now);
  return `${tr(WEEKDAYS[d.getDay()])}, ${d.getDate()} ${tr(MONTHS[d.getMonth()])}`;
}

/** Human friendly relative label: "Today, 09:00", "Tomorrow, 09:00", "In 3 days", "2 days ago". */
export function formatRelative(ts: number, now: number): string {
  const days = diffInCalendarDays(now, ts);
  if (days === 0) {
    return tr('Today, {time}', { time: formatTime(ts) });
  }
  if (days === 1) {
    return tr('Tomorrow, {time}', { time: formatTime(ts) });
  }
  if (days === -1) {
    return tr('Yesterday, {time}', { time: formatTime(ts) });
  }
  if (days > 1 && days < 7) {
    return tr('In {n} days', { n: days });
  }
  if (days < -1 && days > -7) {
    return tr('{n} days ago', { n: -days });
  }
  return formatDate(ts);
}
