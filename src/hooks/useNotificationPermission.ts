import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
import {
  getPermissionState,
  openNotificationSettings,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '../services/notificationService';

/**
 * Tracks notification permissions and refreshes them when the app returns to the
 * foreground (the user may have changed them in system settings).
 */
export function useNotificationPermission() {
  const [state, setState] = useState<NotificationPermissionState | null>(null);

  const refresh = useCallback(async () => {
    setState(await getPermissionState());
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', status => {
      if (status === 'active') {
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  /**
   * Requests permission if needed. If the user previously denied it, explains
   * why and offers to open system settings. Resolves to whether notifications are allowed.
   */
  const ensurePermission = useCallback(async (): Promise<boolean> => {
    const current = await getPermissionState();
    if (current.granted) {
      setState(current);
      return true;
    }
    const requested = await requestNotificationPermission();
    setState(requested);
    if (requested.granted) {
      return true;
    }
    Alert.alert(
      'Notifications are disabled',
      'Your information is saved, but reminders cannot be shown until you allow notifications for My Knowledge Reminder.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => openNotificationSettings() },
      ],
    );
    return false;
  }, []);

  return { state, refresh, ensurePermission };
}
