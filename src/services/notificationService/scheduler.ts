import notifee, {
  AlarmType,
  AndroidImportance,
  RepeatFrequency,
  TriggerType,
  type TimestampTrigger,
} from 'react-native-notify-kit';
import { NOTIFICATION_CHANNEL_ID, NOTIFICATION_CHANNEL_NAME } from '../../constants';
import type { Reminder } from '../../models';
import { AppError, logError } from '../../utils/errors';
import { getNotificationTimestamp } from '../reviewSchedule';
import { buildReminderMessage, notificationIdFor } from './messages';
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
  categoryName: string | null;
  reminder: Reminder;
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

  await ensureChannel();
  const message = buildReminderMessage(target.title, target.categoryName);
  const exact = await canUseExactAlarms();

  const buildTrigger = (useExact: boolean): TimestampTrigger => ({
    type: TriggerType.TIMESTAMP,
    timestamp,
    repeatFrequency: repeatFrequencyFor(target.reminder),
    alarmManager: {
      type: useExact ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE : AlarmType.SET_AND_ALLOW_WHILE_IDLE,
    },
  });

  const notification = {
    id: notificationId,
    title: message.title,
    body: message.body,
    data: { informationId: String(target.informationId) },
    android: {
      channelId: NOTIFICATION_CHANNEL_ID,
      smallIcon: 'ic_stat_notification',
      color: '#4F46E5',
      pressAction: { id: 'default', launchActivity: 'default' },
      autoCancel: true,
    },
  };

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
  return notificationId;
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
