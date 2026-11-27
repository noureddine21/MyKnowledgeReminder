/**
 * Alarm mode: the notification rings and vibrates until the user answers, cannot be
 * swiped away, and opens the full-screen Alarm screen (also over the lock screen).
 */
import { AndroidCategory, AndroidImportance, AndroidVisibility, type NotificationAndroid } from 'react-native-notify-kit';
import { ALARM_CHANNEL_ID } from '../../constants';

/** Press / full-screen action id that opens the Alarm screen. */
export const ALARM_PRESS_ACTION = 'alarm';

export const ALARM_CHANNEL = {
  id: ALARM_CHANNEL_ID,
  importance: AndroidImportance.HIGH,
  vibration: true,
  vibrationPattern: [400, 600, 400, 600],
  sound: 'default',
  visibility: AndroidVisibility.PUBLIC,
};

/** Android options that turn a notification into an alarm. */
export function alarmOptions(): Partial<NotificationAndroid> {
  return {
    channelId: ALARM_CHANNEL_ID,
    category: AndroidCategory.ALARM,
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    // Keeps ringing until the user answers.
    loopSound: true,
    // Cannot be swiped away: an action (Reviewed / Snooze / Done) is required.
    ongoing: true,
    autoCancel: false,
    lightUpScreen: true,
    vibrationPattern: [400, 600, 400, 600],
    pressAction: { id: ALARM_PRESS_ACTION, launchActivity: 'default' },
    fullScreenAction: { id: ALARM_PRESS_ACTION, launchActivity: 'default' },
  };
}

/** True when a notification event comes from an alarm (tap or full-screen launch). */
export function isAlarmEvent(detail: {
  pressAction?: { id?: string };
  notification?: { android?: { channelId?: string; fullScreenAction?: { id?: string } } };
}): boolean {
  return (
    detail.pressAction?.id === ALARM_PRESS_ACTION ||
    detail.notification?.android?.fullScreenAction?.id === ALARM_PRESS_ACTION ||
    detail.notification?.android?.channelId === ALARM_CHANNEL_ID
  );
}
