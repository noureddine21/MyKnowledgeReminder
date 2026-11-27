import notifee from 'react-native-notify-kit';
import type { InformationItem } from '../src/models';
import { cancelDailyItemNotifications, pickItemOfTheDay } from '../src/services/dailyItemService';

const mockedNotifee = notifee as jest.Mocked<typeof notifee>;
const item = (id: number) => ({ id, title: `Item ${id}` }) as InformationItem;

describe('item of the day (home screen)', () => {
  it('is stable during the day and changes the next day', () => {
    const items = [item(3), item(1), item(2)];
    const morning = new Date(2026, 10, 27, 8).getTime();
    const evening = new Date(2026, 10, 27, 22).getTime();
    const tomorrow = new Date(2026, 10, 28, 8).getTime();
    expect(pickItemOfTheDay(items, morning)).toBe(pickItemOfTheDay(items, evening));
    expect(pickItemOfTheDay(items, tomorrow)).not.toBe(pickItemOfTheDay(items, morning));
    expect(pickItemOfTheDay([], morning)).toBeNull();
  });

  it('cancels the morning notifications of older versions', async () => {
    mockedNotifee.getTriggerNotificationIds.mockResolvedValueOnce(['daily-item-0', 'daily-item-1', 'info-4']);
    await cancelDailyItemNotifications();
    const cancelled = mockedNotifee.cancelNotification.mock.calls.map(([id]) => id);
    expect(cancelled).toEqual(expect.arrayContaining(['daily-item-0', 'daily-item-1']));
    expect(cancelled).not.toContain('info-4');
  });
});
