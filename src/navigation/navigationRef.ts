import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/**
 * Global navigation ref so non-React code (notification handlers) can navigate.
 * If navigation is not mounted yet (cold start, DB still loading), the target is
 * kept and applied once the container reports it is ready.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let pendingInformationId: number | null = null;

export function openInformationDetails(informationId: number): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate('InformationDetails', { informationId });
  } else {
    pendingInformationId = informationId;
  }
}

export function flushPendingNavigation(): void {
  if (pendingInformationId !== null && navigationRef.isReady()) {
    const id = pendingInformationId;
    pendingInformationId = null;
    navigationRef.navigate('InformationDetails', { informationId: id });
  }
}
