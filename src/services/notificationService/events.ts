import notifee, { EventType, type Event } from 'react-native-notify-kit';
import { openInformationDetails } from '../../navigation/navigationRef';
import { logError } from '../../utils/errors';
import { informationIdFromData } from './messages';

/** Opens the related information when a reminder notification is pressed. */
export function handleNotificationEvent(event: Event): void {
  if (event.type !== EventType.PRESS) {
    return;
  }
  const id = informationIdFromData(event.detail.notification?.data);
  if (id !== null) {
    openInformationDetails(id);
  }
}

/**
 * Must be called from index.js (outside React) so events delivered while the app
 * is in the background or killed are handled.
 */
export function registerBackgroundNotificationHandler(): void {
  notifee.onBackgroundEvent(async event => {
    try {
      handleNotificationEvent(event);
    } catch (error) {
      logError('notifications:background', error);
    }
  });
}

export function subscribeToForegroundNotifications(): () => void {
  return notifee.onForegroundEvent(event => {
    try {
      handleNotificationEvent(event);
    } catch (error) {
      logError('notifications:foreground', error);
    }
  });
}

/** Handles the notification that launched the app from a killed state (cold start). */
export async function consumeInitialNotification(): Promise<void> {
  try {
    const initial = await notifee.getInitialNotification();
    const id = informationIdFromData(initial?.notification?.data);
    if (id !== null) {
      openInformationDetails(id);
    }
  } catch (error) {
    logError('notifications:initial', error);
  }
}
