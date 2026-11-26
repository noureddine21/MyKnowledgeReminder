/**
 * Day planner service: turns the user's to-do list into an organized day,
 * stores it in SQLite and keeps the planner notifications in sync.
 */
import { getRepositories, inTransaction } from '../database/repositories';
import type { PlanTaskData } from '../database/repositories/planRepository';
import type { AppSettings, DayPlan, DayWindow } from '../models';
import { addDays, applyTimeString } from '../utils/date';
import { findPrayerCity, prayerBlocks, type PrayerBlock } from './prayerTimes';
import { mergeRoutines, routinesForDay } from './routineService';
import { ValidationError, describeError, logError } from '../utils/errors';
import {
  MAX_TASK_MINUTES,
  MIN_TASK_MINUTES,
  dateKey,
  organizeDay,
  parseTaskList,
  type ParsedTask,
} from './dayPlanner';
import {
  cancelNotification,
  cancelPlanTaskNotifications,
  dismissPlanTaskNotification,
  scheduleEveningSummary,
  planTaskNotificationId,
  scheduleMorningPlanReminder,
  schedulePlanTaskNotification,
} from './notificationService';

/** Plans older than this many days are deleted. */
const KEEP_DAYS = 30;
export const MAX_PLAN_INPUT_LENGTH = 5000;

export interface PlanResult {
  plan: DayPlan;
  /** Non-blocking problem (notifications could not be scheduled). */
  warning: string | null;
}

export async function getTodayPlan(now: number = Date.now()): Promise<DayPlan | null> {
  const repos = await getRepositories();
  return repos.plans.findByDate(dateKey(now));
}

/** True when `ts` falls on one of the user's work days. */
export function isWorkDay(settings: AppSettings, ts: number): boolean {
  return settings.planWorkDays.includes(new Date(ts).getDay());
}

/** Today's window from the settings: day hours, plus work hours on work days. */
export function proposedWindow(settings: AppSettings, now: number): DayWindow {
  const working = isWorkDay(settings, now);
  return {
    dayStart: settings.planDayStart,
    dayEnd: settings.planDayEnd,
    workStart: working ? settings.planWorkStart : null,
    workEnd: working ? settings.planWorkEnd : null,
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Field errors for an invalid window (empty object when valid). */
export function validateWindow(window: DayWindow): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!TIME.test(window.dayStart) || !TIME.test(window.dayEnd) || window.dayEnd <= window.dayStart) {
    errors.day = 'The end of your day must be after its start.';
  }
  const working = window.workStart !== null || window.workEnd !== null;
  if (
    working &&
    (!window.workStart ||
      !window.workEnd ||
      !TIME.test(window.workStart) ||
      !TIME.test(window.workEnd) ||
      window.workEnd <= window.workStart)
  ) {
    errors.work = 'Work must end after it starts.';
  }
  return errors;
}

/** Prayers to keep free on `day`, or [] when the option is off / no city chosen. */
export function prayersToAvoid(settings: AppSettings, day: number): PrayerBlock[] {
  const city = settings.planAvoidPrayers ? findPrayerCity(settings.planPrayerCity) : null;
  return city ? prayerBlocks(city, day, settings.planPrayerMinutes) : [];
}

function dayOptions(window: DayWindow, settings: AppSettings, now: number) {
  return {
    busy: prayersToAvoid(settings, now),
    day: now,
    now,
    dayStart: window.dayStart,
    dayEnd: window.dayEnd,
    lunch: settings.planLunchBreak ? { start: settings.planLunchStart, end: settings.planLunchEnd } : null,
    breakMinutes: settings.planBreakMinutes,
    breakAfterMinutes: settings.planBreakAfterMinutes,
    work: window.workStart && window.workEnd ? { start: window.workStart, end: window.workEnd } : null,
  };
}

/** Re-schedules the start notifications of today's remaining tasks. Returns a warning or null. */
export async function syncPlanNotifications(now: number = Date.now()): Promise<string | null> {
  try {
    const repos = await getRepositories();
    const settings = await repos.settings.getAll();
    await cancelPlanTaskNotifications();
    if (!settings.planTaskNotifications) {
      return null;
    }
    const plan = await repos.plans.findByDate(dateKey(now));
    for (const task of plan?.tasks ?? []) {
      if (!task.isDone && task.startAt !== null && task.startAt > now) {
        await schedulePlanTaskNotification(task);
      }
    }
    const remaining = plan?.tasks.filter(t => !t.isDone).length ?? 0;
    const dayEnd = applyTimeString(now, plan?.window?.dayEnd ?? settings.planDayEnd);
    await scheduleEveningSummary(remaining, dayEnd, now);
    return null;
  } catch (error) {
    logError('plan:notifications', error);
    return `Plan saved, but task notifications could not be scheduled: ${describeError(error)}`;
  }
}

/** Applies planner settings to notifications (morning reminder + task notifications). */
export async function applyPlannerSettings(now: number = Date.now()): Promise<void> {
  const repos = await getRepositories();
  const settings = await repos.settings.getAll();
  try {
    await scheduleMorningPlanReminder(settings.planMorningReminder, settings.planMorningTime, now);
  } catch (error) {
    logError('plan:morning', error);
  }
  await syncPlanNotifications(now);
}

/** Organizes today's to-do list (replacing today's plan) and saves it. */
export async function organizeToday(
  rawInput: string,
  now: number = Date.now(),
  window?: DayWindow,
): Promise<PlanResult> {
  const input = rawInput.trim();
  if (input.length > MAX_PLAN_INPUT_LENGTH) {
    throw new ValidationError({ input: `The list must be at most ${MAX_PLAN_INPUT_LENGTH} characters.` });
  }
  const repos = await getRepositories();
  const settings = await repos.settings.getAll();
  const routines = routinesForDay(await repos.routines.findAll(), now);
  const tasks = mergeRoutines(parseTaskList(input), routines);
  if (tasks.length === 0) {
    throw new ValidationError({ input: 'Write at least one task (one per line).' });
  }
  const dayWindow = window ?? proposedWindow(settings, now);
  const windowErrors = validateWindow(dayWindow);
  if (Object.keys(windowErrors).length > 0) {
    throw new ValidationError(windowErrors);
  }
  const organized = organizeDay(tasks, dayOptions(dayWindow, settings, now));
  const key = dateKey(now);

  await inTransaction(async tx => {
    await tx.plans.replace(key, input, organized, now, dayWindow);
    await tx.plans.deleteBefore(dateKey(addDays(now, -KEEP_DAYS)));
  });

  const warning = await syncPlanNotifications(now);
  const plan = await repos.plans.findByDate(key);
  return { plan: plan!, warning };
}

/** "1h30", "45m": duration written the way the list parser reads it. */
export function durationToken(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) {
    return `${m}m`;
  }
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

export interface CarryOver {
  fromDate: string;
  /** Ready-to-paste lines, e.g. "!Finish report 2h". */
  lines: string[];
}

/** Unfinished tasks of the most recent previous plan (last 7 days), to propose today. */
export async function getCarryOver(now: number = Date.now()): Promise<CarryOver | null> {
  const repos = await getRepositories();
  for (let back = 1; back <= 7; back++) {
    const plan = await repos.plans.findByDate(dateKey(addDays(now, -back)));
    if (!plan) {
      continue;
    }
    const lines = plan.tasks
      .filter(t => !t.isDone)
      .map(t => `${t.important ? '!' : ''}${t.title} ${durationToken(t.durationMin)}`);
    return lines.length > 0 ? { fromDate: plan.planDate, lines } : null;
  }
  return null;
}

/** Re-organizes the tasks that are not done yet, starting from now. */
export async function replanRemaining(now: number = Date.now()): Promise<PlanResult> {
  const repos = await getRepositories();
  const key = dateKey(now);
  const plan = await repos.plans.findByDate(key);
  if (!plan) {
    throw new ValidationError({ input: 'There is no plan for today yet.' });
  }
  const settings = await repos.settings.getAll();
  const dayWindow = plan.window ?? proposedWindow(settings, now);
  const remaining: ParsedTask[] = plan.tasks
    .filter(t => !t.isDone)
    .map(t => ({
      title: t.title,
      durationMin: t.durationMin,
      fixedStartMin: t.fixedStartMin,
      important: t.important,
      position: t.position,
    }));
  const organized = organizeDay(remaining, dayOptions(dayWindow, settings, now));
  const byPosition = new Map(plan.tasks.map(t => [t.position, t]));

  const data: PlanTaskData[] = plan.tasks
    .filter(t => t.isDone)
    .map(t => ({ ...t }));
  for (const task of organized) {
    const original = byPosition.get(task.position);
    data.push({ ...task, isDone: false, doneAt: original?.doneAt ?? null });
  }
  data.sort((a, b) => a.position - b.position);

  await inTransaction(tx => tx.plans.replace(key, plan.rawInput, data, now, dayWindow));
  const warning = await syncPlanNotifications(now);
  return { plan: (await repos.plans.findByDate(key))!, warning };
}

export interface TaskTimingInput {
  durationMin: number;
  /** Minutes after midnight to pin the task, or null to let the planner place it. */
  fixedStartMin: number | null;
}

/**
 * Edits the time of one task (start time and/or duration), then re-organizes the
 * remaining tasks of the day around it.
 */
export async function editPlanTaskTiming(
  taskId: number,
  timing: TaskTimingInput,
  now: number = Date.now(),
): Promise<PlanResult> {
  const { durationMin, fixedStartMin } = timing;
  if (!Number.isInteger(durationMin) || durationMin < MIN_TASK_MINUTES || durationMin > MAX_TASK_MINUTES) {
    throw new ValidationError({ duration: `Duration must be between ${MIN_TASK_MINUTES} min and 12 h.` });
  }
  if (fixedStartMin !== null && (!Number.isInteger(fixedStartMin) || fixedStartMin < 0 || fixedStartMin > 1439)) {
    throw new ValidationError({ start: 'Invalid start time.' });
  }
  const repos = await getRepositories();
  const task = await repos.plans.findTask(taskId);
  if (!task) {
    throw new ValidationError({ task: 'This task no longer exists.' });
  }
  await repos.plans.updateTiming(taskId, durationMin, fixedStartMin);
  return replanRemaining(now);
}

/** Checks / unchecks a task, then updates the planner notifications (task starts + evening summary). */
export async function setPlanTaskDone(taskId: number, done: boolean, now: number = Date.now()): Promise<void> {
  const repos = await getRepositories();
  const task = await repos.plans.findTask(taskId);
  if (!task) {
    return;
  }
  await repos.plans.setDone(taskId, done, now);
  if (done) {
    await cancelNotification(planTaskNotificationId(taskId));
    await dismissPlanTaskNotification(taskId);
  }
  await syncPlanNotifications(now);
}
