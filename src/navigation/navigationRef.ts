import { createNavigationContainerRef } from '@react-navigation/native';
import type { SharedDraft } from '../services/shareIntake';
import type { RootStackParamList } from './types';

/**
 * Global navigation ref so non-React code (notification handlers, shares from other apps)
 * can navigate. If navigation is not mounted yet (cold start, DB still loading), the last
 * request is kept and applied once the container reports it is ready.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let pending: (() => void) | null = null;

function navigateWhenReady(action: () => void): void {
  if (navigationRef.isReady()) {
    action();
  } else {
    pending = action;
  }
}

export function openInformationDetails(informationId: number): void {
  navigateWhenReady(() => navigationRef.navigate('InformationDetails', { informationId }));
}

/** Opens the Add form pre-filled with content shared from another app. */
export function openSharedDraft(shared: SharedDraft): void {
  navigateWhenReady(() =>
    navigationRef.navigate('Tabs', {
      screen: 'AddInformation',
      params: { shared, shareId: Date.now() },
    }),
  );
}

/** Opens the full-screen Alarm screen (from an alarm notification). */
export function openAlarm(params: { informationId?: number; planTaskId?: number; notificationId?: string }): void {
  navigateWhenReady(() => navigationRef.navigate('Alarm', params));
}

/** Opens the day planner tab. */
export function openPlan(): void {
  navigateWhenReady(() => navigationRef.navigate('Tabs', { screen: 'Plan' }));
}

export function flushPendingNavigation(): void {
  if (pending && navigationRef.isReady()) {
    const action = pending;
    pending = null;
    action();
  }
}
