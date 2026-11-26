/**
 * Day planner notifications:
 *  - a daily "plan your day" reminder in the morning,
 *  - one notification when each planned task starts (with a "Done" action).
 */
import notifee, { AndroidCategory, RepeatFrequency } from 'react-native-notify-kit';
import { NOTIFICATION_CHANNEL_ID } from '../../constants';
import type { PlanTask } from '../../models';
import { formatTime } from '../../utils/date';
import { logError } from '../../utils/errors';
import { cancelNotification, createTrigger, getScheduledNotificationIds } from './scheduler';

export const MORNING_PLAN_NOTIFICATION_ID = 'plan-morning';
export const PLAN_TASK_DONE_ACTION = 'plan-done';
const PLAN_TASK_PREFIX = 'plan-task-';

export function planTaskNotificationId(taskId: number): string {
  return `${PLAN_TASK_PREFIX}${taskId}`;
}

/** Reads the plan task id from notification data, or null. */
export function planTaskIdFromData(data: Record<string, unknown> | undefined): number | null {
  const raw = data?.planTaskId;
  const id = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** True for notifications that should open the Plan screen. */
export function isPlanNotification(data: Record<string, unknown> | undefined): boolean {
  return data?.screen === 'plan' || planTaskIdFromData(data) !== null;
}

/** Next moment at "HH:mm" strictly after `now`. */
export function nextTimeOfDay(time: string, now: number): number {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  if (d.getTime() <= now) {
    d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}

/** Schedules (or cancels when disabled) the daily morning reminder. */
export async function scheduleMorningPlanReminder(
  enabled: boolean,
  time: string,
  now: number = Date.now(),
): Promise<void> {
  if (!enabled) {
    await cancelNotification(MORNING_PLAN_NOTIFICATION_ID);
    return;
  }
  await createTrigger(
    {
      id: MORNING_PLAN_NOTIFICATION_ID,
      title: 'Plan your day ☀️',
      body: 'Are you working today? Set your hours, write your to-do list and get your day organized.',
      data: { screen: 'plan' },
      android: {
        channelId: NOTIFICATION_CHANNEL_ID,
        smallIcon: 'ic_stat_notification',
        color: '#F59E0B',
        category: AndroidCategory.REMINDER,
        pressAction: { id: 'default', launchActivity: 'default' },
        autoCancel: true,
      },
    },
    nextTimeOfDay(time, now),
    RepeatFrequency.DAILY,
  );
}

export async function schedulePlanTaskNotification(task: PlanTask): Promise<void> {
  if (task.startAt === null || task.endAt === null) {
    return;
  }
  const minutes = Math.round((task.endAt - task.startAt) / 60_000);
  await createTrigger(
    {
      id: planTaskNotificationId(task.id),
      title: `${task.important ? '⭐ ' : ''}Now: ${task.title}`,
      body: `${formatTime(task.startAt)} – ${formatTime(task.endAt)} (${minutes} min)`,
      data: { planTaskId: String(task.id) },
      android: {
        channelId: NOTIFICATION_CHANNEL_ID,
        smallIcon: 'ic_stat_notification',
        color: '#F59E0B',
        category: AndroidCategory.REMINDER,
        showTimestamp: true,
        pressAction: { id: 'default', launchActivity: 'default' },
        actions: [{ title: '✓ Done', pressAction: { id: PLAN_TASK_DONE_ACTION } }],
        autoCancel: true,
      },
    },
    task.startAt,
    undefined,
  );
}

/** Cancels every pending task notification of the planner (keeps the morning reminder). */
export async function cancelPlanTaskNotifications(): Promise<void> {
  const ids = await getScheduledNotificationIds();
  for (const id of ids) {
    if (id.startsWith(PLAN_TASK_PREFIX)) {
      await cancelNotification(id);
    }
  }
}

export async function dismissPlanTaskNotification(taskId: number): Promise<void> {
  try {
    await notifee.cancelDisplayedNotification(planTaskNotificationId(taskId));
  } catch (error) {
    logError('notifications:plan-dismiss', error);
  }
}
