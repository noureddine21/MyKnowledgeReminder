/**
 * Handles user interaction with reminder notifications: tapping the notification
 * opens the item; the action buttons mark it reviewed or snooze it without opening the app.
 *
 * Lives outside `notificationService/` because actions use the review service,
 * which itself depends on the notification service.
 */
import { DeviceEventEmitter } from 'react-native';
import notifee, { EventType, type Event } from 'react-native-notify-kit';
import { DATA_CHANGED_EVENT, NOTIFICATION_CHANNEL_ID } from '../constants';
import { getRepositories } from '../database/repositories';
import { openInformationDetails } from '../navigation/navigationRef';
import { logError } from '../utils/errors';
import {
  NOTIFICATION_ACTIONS,
  SNOOZE_MINUTES,
  dismissDisplayedNotification,
  ensureChannel,
  informationIdFromData,
  notificationIdFor,
  snoozeNotificationIdFor,
  snoozeReminderNotification,
} from './notificationService';
import { toScheduleTarget } from './reminderSync';
import { markReviewed } from './reviewService';

async function dismissAll(informationId: number, shownId: string | undefined): Promise<void> {
  if (shownId) {
    await dismissDisplayedNotification(shownId);
  }
  // The same item may be visible twice (series + snoozed copy).
  await dismissDisplayedNotification(notificationIdFor(informationId));
  await dismissDisplayedNotification(snoozeNotificationIdFor(informationId));
}

async function showActionError(informationId: number): Promise<void> {
  try {
    await ensureChannel();
    await notifee.displayNotification({
      id: `action-error-${informationId}`,
      title: 'Could not update the reminder',
      body: 'Open the app to review this item.',
      data: { informationId: String(informationId) },
      android: {
        channelId: NOTIFICATION_CHANNEL_ID,
        smallIcon: 'ic_stat_notification',
        pressAction: { id: 'default', launchActivity: 'default' },
        autoCancel: true,
      },
    });
  } catch (error) {
    logError('notifications:action-error', error);
  }
}

export async function handleNotificationAction(
  actionId: string,
  informationId: number,
  shownId: string | undefined,
  now: number = Date.now(),
): Promise<void> {
  try {
    if (actionId === NOTIFICATION_ACTIONS.reviewed) {
      await dismissAll(informationId, shownId);
      await markReviewed(informationId, now);
    } else if (actionId in SNOOZE_MINUTES) {
      await dismissAll(informationId, shownId);
      const repos = await getRepositories();
      const item = await repos.information.findById(informationId);
      if (!item) {
        return;
      }
      await snoozeReminderNotification(toScheduleTarget(item), SNOOZE_MINUTES[actionId], now);
    } else {
      return;
    }
    DeviceEventEmitter.emit(DATA_CHANGED_EVENT);
  } catch (error) {
    logError(`notifications:action:${actionId}`, error);
    await showActionError(informationId);
  }
}

export async function handleNotificationEvent(event: Event): Promise<void> {
  const notification = event.detail.notification;
  const id = informationIdFromData(notification?.data);
  if (id === null) {
    return;
  }
  if (event.type === EventType.PRESS) {
    openInformationDetails(id);
  } else if (event.type === EventType.ACTION_PRESS && event.detail.pressAction?.id) {
    await handleNotificationAction(event.detail.pressAction.id, id, notification?.id);
  }
}

/**
 * Must be called from index.js (outside React) so events delivered while the app
 * is in the background or killed are handled (taps and action buttons).
 */
export function registerBackgroundNotificationHandler(): void {
  notifee.onBackgroundEvent(async event => {
    try {
      await handleNotificationEvent(event);
    } catch (error) {
      logError('notifications:background', error);
    }
  });
}

export function subscribeToForegroundNotifications(): () => void {
  return notifee.onForegroundEvent(event => {
    handleNotificationEvent(event).catch(error => logError('notifications:foreground', error));
  });
}

/** Handles the notification that launched the app from a killed state (cold start). */
export async function consumeInitialNotification(): Promise<void> {
  try {
    const initial = await notifee.getInitialNotification();
    // Action buttons never launch the app, so only body taps arrive here.
    const id = informationIdFromData(initial?.notification?.data);
    if (id !== null) {
      openInformationDetails(id);
    }
  } catch (error) {
    logError('notifications:initial', error);
  }
}
