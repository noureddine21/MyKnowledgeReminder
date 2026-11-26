/**
 * "Item of the day": every morning, one item of the user's own library
 * (all categories, or only Quran & Hadith) in a notification.
 *
 * Notifications are static once scheduled, so the next 7 days are scheduled in
 * advance with different items, and refreshed each time the app starts.
 */
import { AndroidCategory, AndroidStyle } from 'react-native-notify-kit';
import { NOTIFICATION_CHANNEL_ID } from '../constants';
import { getRepositories } from '../database/repositories';
import type { AppSettings, InformationItem } from '../models';
import { addDays, applyTimeString } from '../utils/date';
import { logError } from '../utils/errors';
import {
  cancelNotification,
  createTrigger,
  getScheduledNotificationIds,
  buildExpandedText,
} from './notificationService';

import { tr } from '../i18n';
export const DAILY_ITEM_PREFIX = 'daily-item-';
export const DAILY_ITEM_DAYS = 7;
const FAITH_CATEGORIES = ['quran', 'hadith'];

export type DailyItemSource = AppSettings['dailyItemSource'];

export function eligibleItems(items: InformationItem[], source: DailyItemSource): InformationItem[] {
  if (source === 'all') {
    return items;
  }
  return items.filter(i => FAITH_CATEGORIES.includes(i.category?.name.trim().toLowerCase() ?? ''));
}

/** Picks `count` items, as varied as possible (no repeat until all were used). */
export function pickItems<T>(items: T[], count: number, random: () => number = Math.random): T[] {
  if (items.length === 0) {
    return [];
  }
  const picked: T[] = [];
  let pool: T[] = [];
  while (picked.length < count) {
    if (pool.length === 0) {
      pool = [...items];
    }
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

async function cancelDailyItems(): Promise<void> {
  for (const id of await getScheduledNotificationIds()) {
    if (id.startsWith(DAILY_ITEM_PREFIX)) {
      await cancelNotification(id);
    }
  }
}

/** (Re)schedules the item of the day for the next 7 days. Never throws. */
export async function scheduleDailyItems(now: number = Date.now(), random: () => number = Math.random): Promise<number> {
  try {
    const repos = await getRepositories();
    const settings = await repos.settings.getAll();
    await cancelDailyItems();
    if (!settings.dailyItemEnabled) {
      return 0;
    }
    const items = eligibleItems(await repos.information.findAll(), settings.dailyItemSource);
    const days: number[] = [];
    for (let d = 0; days.length < DAILY_ITEM_DAYS && d <= DAILY_ITEM_DAYS; d++) {
      const at = applyTimeString(addDays(now, d), settings.dailyItemTime);
      if (at > now) {
        days.push(at);
      }
    }
    const chosen = pickItems(items, days.length, random);
    for (let i = 0; i < chosen.length; i++) {
      const item = chosen[i];
      const isFaith = FAITH_CATEGORIES.includes(item.category?.name.trim().toLowerCase() ?? '');
      await createTrigger(
        {
          id: `${DAILY_ITEM_PREFIX}${i}`,
          title: isFaith ? `📖 ${item.title}` : `💡 ${item.title}`,
          subtitle: tr('Item of the day'),
          body: item.content.replace(/\s+/g, ' ').slice(0, 140),
          data: { informationId: String(item.id) },
          android: {
            channelId: NOTIFICATION_CHANNEL_ID,
            smallIcon: 'ic_stat_notification',
            color: item.category?.color ?? '#4F46E5',
            category: AndroidCategory.RECOMMENDATION,
            style: { type: AndroidStyle.BIGTEXT, text: buildExpandedText('', item.content, item.source).trim() },
            pressAction: { id: 'default', launchActivity: 'default' },
            autoCancel: true,
          },
        },
        days[i],
        undefined,
      );
    }
    return chosen.length;
  } catch (error) {
    logError('dailyItem:schedule', error);
    return 0;
  }
}
