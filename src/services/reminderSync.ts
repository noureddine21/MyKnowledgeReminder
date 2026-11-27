/**
 * Keeps OS-level scheduled notifications in sync with the reminders stored in SQLite.
 * The database is the source of truth; notifications are derived from it.
 */
import { getRepositories } from '../database/repositories';
import type { InformationItem } from '../models';
import { describeError, logError } from '../utils/errors';
import { refreshWidget } from './widgetService';
import {
  cancelNotification,
  getScheduledNotificationIds,
  notificationIdFor,
  scheduleReminderNotification,
  snoozeNotificationIdFor,
  type ScheduleTarget,
} from './notificationService';

export function toScheduleTarget(item: InformationItem): Omit<ScheduleTarget, 'reminder'> {
  return {
    informationId: item.id,
    title: item.title,
    content: item.content,
    source: item.source,
    categoryName: item.category?.name ?? null,
    categoryColor: item.category?.color ?? null,
    alarm: item.reminder?.alarm ?? false,
  };
}

async function syncItem(item: InformationItem, now: number): Promise<void> {
  const repos = await getRepositories();
  const reminder = item.reminder;
  if (!reminder || !reminder.isActive) {
    await cancelNotification(notificationIdFor(item.id));
    await cancelNotification(snoozeNotificationIdFor(item.id));
    if (reminder?.notificationId) {
      await repos.reminders.setNotificationId(reminder.id, null);
    }
    return;
  }
  const notificationId = await scheduleReminderNotification(
    { ...toScheduleTarget(item), reminder },
    now,
  );
  if (notificationId !== reminder.notificationId) {
    await repos.reminders.setNotificationId(reminder.id, notificationId);
  }
}

/**
 * (Re)schedules or cancels the notification of one item.
 * Returns a user-facing warning if scheduling failed (the data itself is saved).
 */
export async function syncItemNotification(
  informationId: number,
  now: number = Date.now(),
  options: { clearSnooze?: boolean } = {},
): Promise<string | null> {
  try {
    const repos = await getRepositories();
    const item = await repos.information.findById(informationId);
    if (!item || options.clearSnooze) {
      await cancelNotification(snoozeNotificationIdFor(informationId));
    }
    if (!item) {
      await cancelNotification(notificationIdFor(informationId));
      return null;
    }
    await syncItem(item, now);
    await refreshWidget(now);
    return null;
  } catch (error) {
    logError('reminderSync:item', error);
    return `Saved, but the reminder notification could not be scheduled: ${describeError(error)}`;
  }
}

/**
 * Full reconciliation, run at app start: reschedules every active reminder
 * (covers app updates, cleared app data, revoked alarms) and removes orphan triggers.
 */
export async function resyncAllNotifications(now: number = Date.now()): Promise<void> {
  const repos = await getRepositories();
  const items = await repos.information.findAll();
  const expected = new Set<string>();
  const activeIds = new Set<number>();

  for (const item of items) {
    try {
      await syncItem(item, now);
      if (item.reminder?.isActive) {
        expected.add(notificationIdFor(item.id));
        activeIds.add(item.id);
      }
    } catch (error) {
      logError(`reminderSync:resync:${item.id}`, error);
    }
  }

  const scheduled = await getScheduledNotificationIds();
  for (const id of scheduled) {
    if (id.startsWith('info-') && !expected.has(id)) {
      await cancelNotification(id);
    }
    // A snooze is kept while its item still has an active reminder.
    if (id.startsWith('snooze-') && !activeIds.has(Number(id.slice('snooze-'.length)))) {
      await cancelNotification(id);
    }
  }
}
