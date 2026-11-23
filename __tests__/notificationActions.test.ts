import notifee, { AndroidStyle, EventType } from 'react-native-notify-kit';
import { getDatabase } from '../src/database/connection';
import { createRepositories } from '../src/database/repositories';
import type { AppDatabase } from '../src/database/types';
import { saveInformation } from '../src/services/informationService';
import { handleNotificationEvent } from '../src/services/notificationEvents';
import { NOTIFICATION_ACTIONS, buildExpandedText } from '../src/services/notificationService';
import { resyncAllNotifications } from '../src/services/reminderSync';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('../src/navigation/navigationRef', () => ({ openInformationDetails: jest.fn() }));

const at = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 1, 10, 12);
const mockedNotifee = notifee as jest.Mocked<typeof notifee>;

const actionEvent = (actionId: string, informationId: number, shownId = `info-${informationId}`) => ({
  type: EventType.ACTION_PRESS,
  detail: {
    pressAction: { id: actionId },
    notification: { id: shownId, data: { informationId: String(informationId) } },
  },
});

describe('rich notifications and quick actions', () => {
  let db: AppDatabase;
  let nowSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDatabase();
    (getDatabase as jest.Mock).mockResolvedValue(db);
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    nowSpy.mockRestore();
    db.close();
  });

  const saveDaily = async () => {
    const { id } = await saveInformation(
      { title: 'Ayat al-Kursi', content: 'Allah — there is no deity\n\nexcept Him', categoryId: 1, source: 'Al-Baqarah 255', createdAt: NOW },
      { enabled: true, frequency: 'daily', scheduledAt: at(2026, 1, 10, 9) },
    );
    return id;
  };

  it('schedules an expandable notification with content preview and three actions', async () => {
    await saveDaily();
    const [notification] = mockedNotifee.createTriggerNotification.mock.calls[0];
    expect(notification.android?.style).toEqual({
      type: AndroidStyle.BIGTEXT,
      text: expect.stringContaining('Allah — there is no deity except Him'),
    });
    expect((notification.android?.style as { text: string }).text).toContain('— Al-Baqarah 255');
    expect(notification.android?.actions?.map(a => a.pressAction.id)).toEqual([
      NOTIFICATION_ACTIONS.reviewed,
      NOTIFICATION_ACTIONS.snoozeShort,
      NOTIFICATION_ACTIONS.snoozeLong,
    ]);
    // Actions must not open the app.
    expect(notification.android?.actions?.every(a => a.pressAction.launchActivity === undefined)).toBe(true);
  });

  it('"Reviewed" records the review in SQLite and dismisses the notification', async () => {
    const id = await saveDaily();
    await handleNotificationEvent(actionEvent(NOTIFICATION_ACTIONS.reviewed, id) as never);

    const repos = createRepositories(db);
    expect(await repos.reviewHistory.findByInformationId(id)).toHaveLength(1);
    expect((await repos.reminders.findByInformationId(id))?.lastReviewedAt).toBe(NOW);
    expect(mockedNotifee.cancelDisplayedNotification).toHaveBeenCalledWith(`info-${id}`);
    expect(mockedNotifee.cancelNotification).toHaveBeenCalledWith(`snooze-${id}`);
  });

  it('"Snooze 10 min" shows the reminder again later without changing the schedule', async () => {
    const id = await saveDaily();
    const before = await createRepositories(db).reminders.findByInformationId(id);
    mockedNotifee.createTriggerNotification.mockClear();

    await handleNotificationEvent(actionEvent(NOTIFICATION_ACTIONS.snoozeShort, id) as never);

    const [notification, trigger] = mockedNotifee.createTriggerNotification.mock.calls[0];
    expect(notification.id).toBe(`snooze-${id}`);
    expect(trigger).toMatchObject({ timestamp: NOW + 10 * 60_000 });
    expect((trigger as { repeatFrequency?: unknown }).repeatFrequency).toBeUndefined();
    expect(await createRepositories(db).reminders.findByInformationId(id)).toEqual(before);
  });

  it('shows an error notification instead of failing silently', async () => {
    await handleNotificationEvent(actionEvent(NOTIFICATION_ACTIONS.reviewed, 999) as never);
    expect(mockedNotifee.displayNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'action-error-999' }),
    );
  });

  it('keeps a snooze for an active item but removes orphan snoozes on resync', async () => {
    const id = await saveDaily();
    mockedNotifee.getTriggerNotificationIds.mockResolvedValueOnce([`info-${id}`, `snooze-${id}`, 'snooze-42']);
    mockedNotifee.cancelNotification.mockClear();

    await resyncAllNotifications(NOW);

    expect(mockedNotifee.cancelNotification).toHaveBeenCalledWith('snooze-42');
    expect(mockedNotifee.cancelNotification).not.toHaveBeenCalledWith(`snooze-${id}`);
  });

  it('builds the expanded text from body, collapsed content and source', () => {
    expect(buildExpandedText('Remember: X', 'line 1\n\n  line 2', null)).toBe('Remember: X\n\nline 1 line 2');
    expect(buildExpandedText('B', '', ' Book ')).toBe('B\n\n— Book');
  });
});
