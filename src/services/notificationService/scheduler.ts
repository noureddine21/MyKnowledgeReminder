import notifee, {
  AlarmType,
  AndroidCategory,
  AndroidImportance,
  AndroidStyle,
  RepeatFrequency,
  TriggerType,
  type Notification,
  type TimestampTrigger,
} from 'react-native-notify-kit';
import { NOTIFICATION_CHANNEL_ID, NOTIFICATION_CHANNEL_NAME } from '../../constants';
import type { Reminder } from '../../models';
import { AppError, logError } from '../../utils/errors';
import { getNotificationTimestamp } from '../reviewSchedule';
import {
  NOTIFICATION_ACTIONS,
  buildExpandedText,
  buildReminderMessage,
  notificationIdFor,
  snoozeNotificationIdFor,
} from './messages';
import { canUseExactAlarms } from './permissions';

let channelReady: Promise<void> | null = null;

/** Creates the Android notification channel (idempotent). */
export function ensureChannel(): Promise<void> {
  if (!channelReady) {
    channelReady = notifee
      .createChannel({
        id: NOTIFICATION_CHANNEL_ID,
        name: NOTIFICATION_CHANNEL_NAME,
        description: 'Reminders to review the information you saved',
        importance: AndroidImportance.HIGH,
        vibration: true,
      })
      .then(() => undefined)
      .catch(error => {
        channelReady = null;
        throw error;
      });
  }
  return channelReady;
}

function repeatFrequencyFor(reminder: Reminder): RepeatFrequency | undefined {
  switch (reminder.frequency) {
    case 'hourly':
      return RepeatFrequency.HOURLY;
    case 'daily':
      return RepeatFrequency.DAILY;
    case 'weekly':
      return RepeatFrequency.WEEKLY;
    case 'monthly':
      return RepeatFrequency.MONTHLY;
    default:
      return undefined;
  }
}

export interface ScheduleTarget {
  informationId: number;
  title: string;
  content: string;
  source: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  reminder: Reminder;
}

const DEFAULT_COLOR = '#4F46E5';
const GROUP_ID = 'review-reminders';

/** Rich reminder: expandable content preview, category colour, and quick actions. */
export function buildReminderNotification(
  target: Omit<ScheduleTarget, 'reminder'>,
  notificationId: string,
): Notification {
  const message = buildReminderMessage(target.title, target.categoryName);
  return {
    id: notificationId,
    title: message.title,
    // Shown next to the app name on Android (category of the item).
    subtitle: target.categoryName ?? undefined,
    body: message.body,
    data: { informationId: String(target.informationId) },
    android: {
      channelId: NOTIFICATION_CHANNEL_ID,
      smallIcon: 'ic_stat_notification',
      color: target.categoryColor ?? DEFAULT_COLOR,
      category: AndroidCategory.REMINDER,
      groupId: GROUP_ID,
      showTimestamp: true,
      style: {
        type: AndroidStyle.BIGTEXT,
        text: buildExpandedText(message.body, target.content, target.source),
      },
      pressAction: { id: 'default', launchActivity: 'default' },
      // No launchActivity: these run in the background without opening the app.
      actions: [
        { title: '✓ Reviewed', pressAction: { id: NOTIFICATION_ACTIONS.reviewed } },
        { title: 'Snooze 10 min', pressAction: { id: NOTIFICATION_ACTIONS.snoozeShort } },
        { title: 'Snooze 1 h', pressAction: { id: NOTIFICATION_ACTIONS.snoozeLong } },
      ],
      autoCancel: true,
    },
  };
}

/** Creates a trigger notification, preferring an exact alarm and falling back to an inexact one. */
export async function createTrigger(
  notification: Notification,
  timestamp: number,
  repeatFrequency: RepeatFrequency | undefined,
  repeatInterval = 1,
): Promise<void> {
  await ensureChannel();
  const exact = await canUseExactAlarms();
  const buildTrigger = (useExact: boolean): TimestampTrigger => ({
    type: TriggerType.TIMESTAMP,
    timestamp,
    repeatFrequency,
    // Only valid together with a repeat frequency ("every N hours/days/...").
    ...(repeatFrequency !== undefined && repeatInterval > 1 ? { repeatInterval } : {}),
    alarmManager: {
      type: useExact ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE : AlarmType.SET_AND_ALLOW_WHILE_IDLE,
    },
  });

  try {
    await notifee.createTriggerNotification(notification, buildTrigger(exact));
  } catch (error) {
    if (!exact) {
      logError('notifications:schedule', error);
      throw new AppError('NOTIFICATION', 'The reminder could not be scheduled.', error);
    }
    // Exact alarm access may have been revoked in the meantime: retry inexact.
    try {
      await notifee.createTriggerNotification(notification, buildTrigger(false));
    } catch (retryError) {
      logError('notifications:schedule', retryError);
      throw new AppError('NOTIFICATION', 'The reminder could not be scheduled.', retryError);
    }
  }
}

/**
 * Schedules (or replaces) the trigger notification for an item.
 * Returns the notification id, or null when nothing needs to be scheduled.
 *
 * Uses exact alarms when the user granted that access (Android 12+), otherwise
 * falls back to inexact alarms that Android may delay to save battery.
 */
export async function scheduleReminderNotification(
  target: ScheduleTarget,
  now: number = Date.now(),
): Promise<string | null> {
  const notificationId = notificationIdFor(target.informationId);
  const timestamp = getNotificationTimestamp(target.reminder, now);

  if (timestamp === null) {
    await cancelNotification(notificationId);
    return null;
  }

  await createTrigger(
    buildReminderNotification(target, notificationId),
    timestamp,
    repeatFrequencyFor(target.reminder),
    target.reminder.repeatInterval,
  );
  return notificationId;
}

/** Shows the reminder again in `minutes` (one-off, does not change the stored schedule). */
export async function snoozeReminderNotification(
  target: Omit<ScheduleTarget, 'reminder'>,
  minutes: number,
  now: number = Date.now(),
): Promise<number> {
  const at = now + minutes * 60_000;
  await createTrigger(
    buildReminderNotification(target, snoozeNotificationIdFor(target.informationId)),
    at,
    undefined,
  );
  return at;
}

/** Removes a notification from the tray without touching its scheduled trigger. Never throws. */
export async function dismissDisplayedNotification(notificationId: string): Promise<void> {
  try {
    await notifee.cancelDisplayedNotification(notificationId);
  } catch (error) {
    logError('notifications:dismiss', error);
  }
}

/** Cancels both the pending trigger and any displayed notification. Never throws. */
export async function cancelNotification(notificationId: string): Promise<void> {
  try {
    await notifee.cancelNotification(notificationId);
  } catch (error) {
    logError('notifications:cancel', error);
  }
}

export async function getScheduledNotificationIds(): Promise<string[]> {
  try {
    return await notifee.getTriggerNotificationIds();
  } catch (error) {
    logError('notifications:list', error);
    return [];
  }
}
