/**
 * "Item of the day" on the home screen: one item of the user's library,
 * stable for the whole day and different every day.
 * (The morning notification was removed; old scheduled ones are cancelled at start.)
 */
import type { InformationItem } from '../models';
import { logError } from '../utils/errors';
import { cancelNotification, getScheduledNotificationIds } from './notificationService';

export const DAILY_ITEM_PREFIX = 'daily-item-';

/** Cancels the morning notifications scheduled by older versions. Never throws. */
export async function cancelDailyItemNotifications(): Promise<void> {
  try {
    for (const id of await getScheduledNotificationIds()) {
      if (id.startsWith(DAILY_ITEM_PREFIX)) {
        await cancelNotification(id);
      }
    }
  } catch (error) {
    logError('dailyItem:cancel', error);
  }
}

/** The item shown on the home screen today: stable for the whole day, changes every day. */
export function pickItemOfTheDay(items: InformationItem[], now: number): InformationItem | null {
  if (items.length === 0) {
    return null;
  }
  const d = new Date(now);
  const seed = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
  const sorted = [...items].sort((a, b) => a.id - b.id);
  return sorted[seed % sorted.length];
}
