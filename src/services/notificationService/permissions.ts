import { Linking, Platform } from 'react-native';
import notifee, { AndroidNotificationSetting, AuthorizationStatus } from 'react-native-notify-kit';
import { logError } from '../../utils/errors';

export type ExactAlarmState = 'enabled' | 'disabled' | 'unsupported';

export interface NotificationPermissionState {
  /** User allowed the app to post notifications. */
  granted: boolean;
  /** Permission was never requested yet (Android 13+). */
  notDetermined: boolean;
  /** Android 12+: whether exact alarms are allowed. "unsupported" = not needed on this OS. */
  exactAlarms: ExactAlarmState;
  /** Battery optimization may delay or block reminders. */
  batteryOptimized: boolean;
}

const UNKNOWN_STATE: NotificationPermissionState = {
  granted: false,
  notDetermined: true,
  exactAlarms: 'unsupported',
  batteryOptimized: false,
};

function toState(
  settings: Awaited<ReturnType<typeof notifee.getNotificationSettings>>,
  batteryOptimized: boolean,
): NotificationPermissionState {
  const alarm = settings.android?.alarm;
  return {
    granted:
      settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
      settings.authorizationStatus === AuthorizationStatus.PROVISIONAL,
    notDetermined: settings.authorizationStatus === AuthorizationStatus.NOT_DETERMINED,
    exactAlarms:
      alarm === AndroidNotificationSetting.ENABLED
        ? 'enabled'
        : alarm === AndroidNotificationSetting.DISABLED
          ? 'disabled'
          : 'unsupported',
    batteryOptimized,
  };
}

async function readBatteryOptimization(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  try {
    return await notifee.isBatteryOptimizationEnabled();
  } catch (error) {
    logError('notifications:battery', error);
    return false;
  }
}

export async function getPermissionState(): Promise<NotificationPermissionState> {
  try {
    const [settings, battery] = await Promise.all([
      notifee.getNotificationSettings(),
      readBatteryOptimization(),
    ]);
    return toState(settings, battery);
  } catch (error) {
    logError('notifications:getPermissionState', error);
    return UNKNOWN_STATE;
  }
}

/**
 * Asks for the POST_NOTIFICATIONS runtime permission (Android 13+).
 * On older Android versions notifications are allowed by default.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  try {
    const settings = await notifee.requestPermission();
    return toState(settings, await readBatteryOptimization());
  } catch (error) {
    logError('notifications:requestPermission', error);
    return getPermissionState();
  }
}

export async function canUseExactAlarms(): Promise<boolean> {
  try {
    const settings = await notifee.getNotificationSettings();
    const alarm = settings.android?.alarm;
    // NOT_SUPPORTED means Android < 12, where exact alarms need no special access.
    return alarm === AndroidNotificationSetting.ENABLED || alarm === AndroidNotificationSetting.NOT_SUPPORTED;
  } catch {
    return false;
  }
}

export async function openNotificationSettings(): Promise<void> {
  try {
    await notifee.openNotificationSettings();
  } catch (error) {
    logError('notifications:openSettings', error);
    await Linking.openSettings();
  }
}

export async function openExactAlarmSettings(): Promise<void> {
  try {
    await notifee.openAlarmPermissionSettings();
  } catch (error) {
    logError('notifications:openAlarmSettings', error);
    await Linking.openSettings();
  }
}

export async function openBatteryOptimizationSettings(): Promise<void> {
  try {
    await notifee.openBatteryOptimizationSettings();
  } catch (error) {
    logError('notifications:openBatterySettings', error);
    await Linking.openSettings();
  }
}
