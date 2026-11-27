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
import { openAlarm, openInformationDetails, openPlan } from '../navigation/navigationRef';
import { logError } from '../utils/errors';
import {
  NOTIFICATION_ACTIONS,
  SNOOZE_MINUTES,
  dismissDisplayedNotification,
  ensureChannel,
  informationIdFromData,
  isAlarmEvent,
  isPlanNotification,
  PLAN_TASK_DONE_ACTION,
  planTaskIdFromData,
  notificationIdFor,
  snoozeNotificationIdFor,
  snoozeReminderNotification,
} from './notificationService';
import { toScheduleTarget } from './reminderSync';
import { setPlanTaskDone } from './planService';
import { markReviewed } from './reviewService';

import { resolveLanguage, setLanguage, tr } from '../i18n';
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
      title: tr('Could not update the reminder'),
      body: tr('Open the app to review this item.'),
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

/** Day planner notifications: tap opens the Plan tab, "Done" checks the task off. */
async function handlePlanEvent(event: Event): Promise<void> {
  const data = event.detail.notification?.data;
  const taskId = planTaskIdFromData(data);
  if (event.type === EventType.PRESS) {
    if (taskId && isAlarmEvent(event.detail)) {
      openAlarm({ planTaskId: taskId, notificationId: event.detail.notification?.id });
    } else {
      openPlan();
    }
    return;
  }
  if (event.type === EventType.ACTION_PRESS && event.detail.pressAction?.id === PLAN_TASK_DONE_ACTION && taskId) {
    await setPlanTaskDone(taskId, true);
    DeviceEventEmitter.emit(DATA_CHANGED_EVENT);
  }
}

/** Background events can run before the app UI: make sure texts use the chosen language. */
async function ensureLanguage(): Promise<void> {
  try {
    const repos = await getRepositories();
    setLanguage(resolveLanguage((await repos.settings.getAll()).language));
  } catch (error) {
    logError('notifications:language', error);
  }
}

export async function handleNotificationEvent(event: Event): Promise<void> {
  const notification = event.detail.notification;
  if (event.type === EventType.ACTION_PRESS) {
    await ensureLanguage();
  }
  if (isPlanNotification(notification?.data)) {
    await handlePlanEvent(event);
    return;
  }
  const id = informationIdFromData(notification?.data);
  if (id === null) {
    return;
  }
  if (event.type === EventType.PRESS) {
    if (isAlarmEvent(event.detail)) {
      openAlarm({ informationId: id, notificationId: notification?.id });
    } else {
      openInformationDetails(id);
    }
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

/** Alarm that rings while the app is open: show the Alarm screen right away. */
function openAlarmIfDelivered(event: Event): boolean {
  if (event.type !== EventType.DELIVERED || !isAlarmEvent(event.detail)) {
    return false;
  }
  const data = event.detail.notification?.data;
  const notificationId = event.detail.notification?.id;
  const taskId = planTaskIdFromData(data);
  const informationId = informationIdFromData(data);
  if (taskId) {
    openAlarm({ planTaskId: taskId, notificationId });
  } else if (informationId !== null) {
    openAlarm({ informationId, notificationId });
  }
  return true;
}

export function subscribeToForegroundNotifications(): () => void {
  return notifee.onForegroundEvent(event => {
    if (openAlarmIfDelivered(event)) {
      return;
    }
    handleNotificationEvent(event).catch(error => logError('notifications:foreground', error));
  });
}

/** Handles the notification that launched the app from a killed state (cold start). */
export async function consumeInitialNotification(): Promise<void> {
  try {
    const initial = await notifee.getInitialNotification();
    const data = initial?.notification?.data;
    // Launched by an alarm (full screen or tap): open the Alarm screen.
    if (initial && isAlarmEvent({ pressAction: initial.pressAction, notification: initial.notification })) {
      const taskId = planTaskIdFromData(data);
      const infoId = informationIdFromData(data);
      if (taskId || infoId !== null) {
        openAlarm({
          planTaskId: taskId ?? undefined,
          informationId: infoId ?? undefined,
          notificationId: initial.notification.id,
        });
        return;
      }
    }
    if (isPlanNotification(data)) {
      openPlan();
      return;
    }
    // Action buttons never launch the app, so only body taps arrive here.
    const id = informationIdFromData(initial?.notification?.data);
    if (id !== null) {
      openInformationDetails(id);
    }
  } catch (error) {
    logError('notifications:initial', error);
  }
}
