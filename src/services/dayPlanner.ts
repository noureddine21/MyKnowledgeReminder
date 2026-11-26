/**
 * Day planner: pure logic (no I/O).
 *
 * 1. `parseTaskList` reads a free-text to-do list, one task per line:
 *      "Sport 1h", "Call Ahmed 15m", "Meeting @14:00 1h", "!Finish report 2h"
 *    - duration: 1h, 2h30, 1.5h, 45m, 45min, 20mn (default 30 min)
 *    - fixed time: @14:00, @14h, @9h30, "à 14h", "at 9:30"
 *    - "!" at the start or end = important
 * 2. `organizeDay` turns the tasks into a timetable between the day start/end:
 *    fixed tasks keep their time; the others are placed in order (important first),
 *    with 5 min between tasks, a 15 min break after 2 h of work, lunch and work hours
 *    kept free, and anything that does not fit is returned unscheduled.
 */

export const DEFAULT_TASK_MINUTES = 30;
export const MIN_TASK_MINUTES = 5;
export const MAX_TASK_MINUTES = 720;
export const GAP_MINUTES = 5;
export const BREAK_AFTER_MINUTES = 120;
export const BREAK_MINUTES = 15;
export const LUNCH_START = '12:30';
export const LUNCH_END = '13:30';

const MINUTE = 60_000;

export interface ParsedTask {
  title: string;
  durationMin: number;
  /** Minutes after midnight, when the user fixed a time. */
  fixedStartMin: number | null;
  important: boolean;
  /** Position in the user's list. */
  position: number;
}

export interface OrganizedTask extends ParsedTask {
  startAt: number | null;
  endAt: number | null;
}

export interface DayOptions {
  /** Any moment of the planned day (local time). */
  day: number;
  now: number;
  dayStart: string;
  dayEnd: string;
  /** Lunch kept free ("HH:mm"), or null. */
  lunch?: { start: string; end: string } | null;
  /** Break length after `breakAfterMinutes` of continuous tasks (defaults 15 / 120; 0 = none). */
  breakMinutes?: number;
  breakAfterMinutes?: number;
  /** Work hours ("HH:mm") on a work day: tasks are planned around them. */
  work?: { start: string; end: string } | null;
}

/** Work block of the day as timestamps, or null (day off / invalid). */
export function workWindow(
  day: number,
  work: { start: string; end: string } | null | undefined,
): { start: number; end: number } | null {
  if (!work) {
    return null;
  }
  const start = atTime(day, work.start);
  const end = atTime(day, work.end);
  return end > start ? { start, end } : null;
}

const FIXED_TIME = /(?:@\s*|(?:^|\s)(?:à|at)\s+)(\d{1,2})(?:\s*[:h.]\s*(\d{2})|\s*h)?(?!\d)/i;
const HOURS = /(?<![\w@:])(\d{1,2}(?:[.,]\d+)?)\s*h(?:ours?|eures?|rs?)?(?:\s*(\d{1,2})(?:\s*(?:m|mn|min|minutes?))?)?(?![\w:])/i;
const MINUTES = /(?<![\w@:])(\d{1,3})\s*(?:m|mn|min|mins|minutes?)(?![\w])/i;
const BULLET = /^\s*(?:[-*•·]+|\d+[.)])\s*/;

function clampDuration(min: number): number {
  return Math.min(MAX_TASK_MINUTES, Math.max(MIN_TASK_MINUTES, Math.round(min)));
}

/** Parses one line; null for empty lines. */
export function parseTaskLine(line: string, position: number): ParsedTask | null {
  let text = line.replace(BULLET, '').trim();
  if (!text) {
    return null;
  }

  let important = false;
  if (text.startsWith('!') || text.endsWith('!')) {
    important = true;
    text = text.replace(/^!+|!+$/g, '').trim();
  }

  let fixedStartMin: number | null = null;
  const fixed = FIXED_TIME.exec(text);
  if (fixed) {
    const h = Number(fixed[1]);
    const m = fixed[2] ? Number(fixed[2]) : 0;
    if (h < 24 && m < 60) {
      fixedStartMin = h * 60 + m;
      text = text.replace(fixed[0], ' ');
    }
  }

  let duration = 0;
  const hours = HOURS.exec(text);
  if (hours) {
    duration += Number(hours[1].replace(',', '.')) * 60 + (hours[2] ? Number(hours[2]) : 0);
    text = text.replace(hours[0], ' ');
  }
  const minutes = MINUTES.exec(text);
  if (minutes) {
    duration += Number(minutes[1]);
    text = text.replace(minutes[0], ' ');
  }

  const title = text.replace(/\s{2,}/g, ' ').replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, '').trim();
  if (!title) {
    return null;
  }
  return {
    title: title.slice(0, 150),
    durationMin: clampDuration(duration || DEFAULT_TASK_MINUTES),
    fixedStartMin,
    important,
    position,
  };
}

export function parseTaskList(text: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  for (const line of text.split(/\r?\n/)) {
    const task = parseTaskLine(line, tasks.length);
    if (task) {
      tasks.push(task);
    }
  }
  return tasks;
}

function atTime(day: number, time: string): number {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

function atMinutes(day: number, minutes: number): number {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d.getTime();
}

function ceilTo5Minutes(ts: number): number {
  const step = 5 * MINUTE;
  return Math.ceil(ts / step) * step;
}

export function lunchWindow(
  day: number,
  lunch: { start: string; end: string } = { start: LUNCH_START, end: LUNCH_END },
): { start: number; end: number } | null {
  const start = atTime(day, lunch.start);
  const end = atTime(day, lunch.end);
  return end > start ? { start, end } : null;
}

/** Builds the timetable. Tasks keep their fields; unscheduled ones have startAt = null. */
export function organizeDay(tasks: ParsedTask[], options: DayOptions): OrganizedTask[] {
  const dayStart = atTime(options.day, options.dayStart);
  let dayEnd = atTime(options.day, options.dayEnd);
  if (dayEnd <= dayStart) {
    dayEnd = atTime(options.day, '23:59');
  }
  const windowStart = Math.max(dayStart, ceilTo5Minutes(options.now));

  const result: OrganizedTask[] = [];
  const blocked: { start: number; end: number; isBreak: boolean }[] = [];

  const lunch = options.lunch ? lunchWindow(options.day, options.lunch) : null;
  if (lunch) {
    blocked.push({ ...lunch, isBreak: true });
  }
  const breakMinutes = options.breakMinutes ?? BREAK_MINUTES;
  const breakAfter = options.breakAfterMinutes ?? BREAK_AFTER_MINUTES;
  const work = workWindow(options.day, options.work);
  if (work) {
    blocked.push({ ...work, isBreak: true });
  }

  // 1. Fixed-time tasks stay where the user put them.
  for (const task of tasks.filter(t => t.fixedStartMin !== null)) {
    const startAt = atMinutes(options.day, task.fixedStartMin!);
    const endAt = startAt + task.durationMin * MINUTE;
    result.push({ ...task, startAt, endAt });
    blocked.push({ start: startAt - GAP_MINUTES * MINUTE, end: endAt + GAP_MINUTES * MINUTE, isBreak: false });
  }

  // 2. Flexible tasks: important first, then the user's order.
  const flexible = tasks
    .filter(t => t.fixedStartMin === null)
    .sort((a, b) => Number(b.important) - Number(a.important) || a.position - b.position);

  let cursor = windowStart;
  let streak = 0;
  for (const task of flexible) {
    const duration = task.durationMin * MINUTE;
    let start = cursor;
    let crossedBreak = false;
    // Move past any blocked interval that overlaps [start, start + duration).
    for (let guard = 0; guard < 100; guard++) {
      const overlap = blocked.find(b => start < b.end && start + duration > b.start);
      if (!overlap) {
        break;
      }
      start = overlap.end;
      crossedBreak = crossedBreak || overlap.isBreak;
    }
    if (start + duration > dayEnd) {
      result.push({ ...task, startAt: null, endAt: null });
      continue;
    }
    const end = start + duration;
    result.push({ ...task, startAt: start, endAt: end });
    blocked.push({ start, end, isBreak: false });

    streak = crossedBreak || start > cursor ? task.durationMin : streak + task.durationMin;
    if (breakMinutes > 0 && streak >= breakAfter) {
      cursor = end + Math.max(breakMinutes, GAP_MINUTES) * MINUTE;
      streak = 0;
    } else {
      cursor = end + GAP_MINUTES * MINUTE;
    }
  }

  return result.sort((a, b) => {
    if (a.startAt === null || b.startAt === null) {
      return a.startAt === null ? (b.startAt === null ? a.position - b.position : 1) : -1;
    }
    return a.startAt - b.startAt;
  });
}

/** Local date key "YYYY-MM-DD". */
export function dateKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) {
    return `${m} min`;
  }
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}
