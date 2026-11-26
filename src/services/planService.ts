/**
 * Day planner service: turns the user's to-do list into an organized day,
 * stores it in SQLite and keeps the planner notifications in sync.
 */
import { getRepositories, inTransaction } from '../database/repositories';
import type { PlanTaskData } from '../database/repositories/planRepository';
import type { AppSettings, DayPlan } from '../models';
import { addDays } from '../utils/date';
import { ValidationError, describeError, logError } from '../utils/errors';
import { dateKey, organizeDay, parseTaskList, type ParsedTask } from './dayPlanner';
import {
  cancelNotification,
  cancelPlanTaskNotifications,
  dismissPlanTaskNotification,
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

function dayOptions(settings: AppSettings, now: number) {
  return {
    day: now,
    now,
    dayStart: settings.planDayStart,
    dayEnd: settings.planDayEnd,
    lunchBreak: settings.planLunchBreak,
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
export async function organizeToday(rawInput: string, now: number = Date.now()): Promise<PlanResult> {
  const input = rawInput.trim();
  if (input.length > MAX_PLAN_INPUT_LENGTH) {
    throw new ValidationError({ input: `The list must be at most ${MAX_PLAN_INPUT_LENGTH} characters.` });
  }
  const tasks = parseTaskList(input);
  if (tasks.length === 0) {
    throw new ValidationError({ input: 'Write at least one task (one per line).' });
  }

  const repos = await getRepositories();
  const settings = await repos.settings.getAll();
  const organized = organizeDay(tasks, dayOptions(settings, now));
  const key = dateKey(now);

  await inTransaction(async tx => {
    await tx.plans.replace(key, input, organized, now);
    await tx.plans.deleteBefore(dateKey(addDays(now, -KEEP_DAYS)));
  });

  const warning = await syncPlanNotifications(now);
  const plan = await repos.plans.findByDate(key);
  return { plan: plan!, warning };
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
  const remaining: ParsedTask[] = plan.tasks
    .filter(t => !t.isDone)
    .map(t => ({
      title: t.title,
      durationMin: t.durationMin,
      fixedStartMin: t.fixedStartMin,
      important: t.important,
      position: t.position,
    }));
  const organized = organizeDay(remaining, dayOptions(settings, now));
  const byPosition = new Map(plan.tasks.map(t => [t.position, t]));

  const data: PlanTaskData[] = plan.tasks
    .filter(t => t.isDone)
    .map(t => ({ ...t }));
  for (const task of organized) {
    const original = byPosition.get(task.position);
    data.push({ ...task, isDone: false, doneAt: original?.doneAt ?? null });
  }
  data.sort((a, b) => a.position - b.position);

  await inTransaction(tx => tx.plans.replace(key, plan.rawInput, data, now));
  const warning = await syncPlanNotifications(now);
  return { plan: (await repos.plans.findByDate(key))!, warning };
}

/** Checks / unchecks a task and updates its start notification. */
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
    return;
  }
  const settings = await repos.settings.getAll();
  if (settings.planTaskNotifications && task.startAt !== null && task.startAt > now) {
    try {
      await schedulePlanTaskNotification({ ...task, isDone: false });
    } catch (error) {
      logError('plan:task-notification', error);
    }
  }
}
