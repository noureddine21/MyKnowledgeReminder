import notifee from 'react-native-notify-kit';
import { getDatabase } from '../src/database/connection';
import { createRepositories } from '../src/database/repositories';
import type { AppDatabase } from '../src/database/types';
import { deleteCategory, createCategory } from '../src/services/categoryService';
import { deleteInformation, listInformation, saveInformation } from '../src/services/informationService';
import { getDashboard, getDueToday, markReviewed, rescheduleReview, setReminderActive } from '../src/services/reviewService';
import { ValidationError } from '../src/utils/errors';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));

const at = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 1, 10, 12);

const mockedNotifee = notifee as jest.Mocked<typeof notifee>;

describe('services (SQLite + notifications)', () => {
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

  const input = (patch = {}) => ({
    title: 'Azure Artifacts',
    content: 'Feeds, upstream sources and views',
    categoryId: null,
    source: null,
    createdAt: NOW,
    ...patch,
  });

  it('saves information with a one-time reminder and schedules a notification', async () => {
    const { id, warning } = await saveInformation(input(), { enabled: true, frequency: 'once', scheduledAt: at(2026, 1, 11, 9) });
    expect(warning).toBeNull();
    expect(mockedNotifee.createTriggerNotification).toHaveBeenCalledTimes(1);
    const [notification, trigger] = mockedNotifee.createTriggerNotification.mock.calls[0];
    expect(notification.id).toBe(`info-${id}`);
    expect(notification.data).toEqual({ informationId: String(id) });
    expect(trigger).toMatchObject({ timestamp: at(2026, 1, 11, 9) });

    const reminder = await createRepositories(db).reminders.findByInformationId(id);
    expect(reminder).toMatchObject({ frequency: 'once', isActive: true, notificationId: `info-${id}` });
  });

  it('rejects invalid input without writing anything', async () => {
    await expect(
      saveInformation(input({ title: '' }), { enabled: false, frequency: 'once', scheduledAt: NOW }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await createRepositories(db).information.count()).toBe(0);
  });

  it('follows the smart schedule through review steps until completion', async () => {
    const { id } = await saveInformation(input(), { enabled: true, frequency: 'spaced', scheduledAt: at(2000, 1, 1, 9) });
    const repos = createRepositories(db);
    expect(await repos.reminders.findByInformationId(id)).toMatchObject({
      scheduledAt: at(2026, 1, 11, 9),
      spacedStep: 0,
      spacedBaseAt: NOW,
    });

    const expected = [at(2026, 1, 13, 9), at(2026, 1, 17, 9), at(2026, 2, 9, 9)];
    let reviewAt = at(2026, 1, 11, 9, 30);
    for (const next of expected) {
      const result = await markReviewed(id, reviewAt);
      expect(result).toMatchObject({ completed: false, nextAt: next });
      reviewAt = next + 60_000;
    }
    const last = await markReviewed(id, reviewAt);
    expect(last.completed).toBe(true);
    expect((await repos.reminders.findByInformationId(id))?.isActive).toBe(false);
    expect(await repos.reviewHistory.findByInformationId(id)).toHaveLength(4);
  });

  it('keeps smart schedule progress when only the text is edited', async () => {
    const { id } = await saveInformation(input(), { enabled: true, frequency: 'spaced', scheduledAt: at(2000, 1, 1, 9) });
    await markReviewed(id, at(2026, 1, 11, 9, 30));
    const repos = createRepositories(db);
    const before = await repos.reminders.findByInformationId(id);
    await saveInformation(input({ title: 'Renamed' }), { enabled: true, frequency: 'spaced', scheduledAt: before!.scheduledAt }, id);
    const after = await repos.reminders.findByInformationId(id);
    expect(after).toMatchObject({ spacedStep: 1, scheduledAt: before!.scheduledAt });
  });

  it('lists due items and hides recurring ones once reviewed today', async () => {
    const daily = await saveInformation(input({ title: 'Daily' }), { enabled: true, frequency: 'daily', scheduledAt: at(2026, 1, 10, 13) });
    await saveInformation(input({ title: 'Tomorrow' }), { enabled: true, frequency: 'once', scheduledAt: at(2026, 1, 11, 9) });

    let due = await getDueToday(NOW);
    expect(due.map(d => d.item.title)).toEqual(['Daily']);

    await markReviewed(daily.id, NOW);
    due = await getDueToday(NOW);
    expect(due).toHaveLength(0);
    // Still due tomorrow.
    expect((await getDueToday(at(2026, 1, 11, 14))).map(d => d.item.title)).toEqual(['Tomorrow', 'Daily']);

    const dashboard = await getDashboard(NOW);
    expect(dashboard).toMatchObject({ total: 2, activeReminders: 2, reviewedToday: 1 });
    expect(dashboard.upcoming.map(u => u.item.title)).toEqual(['Daily', 'Tomorrow']);
  });

  it('reschedules a review and records it in the history', async () => {
    const { id } = await saveInformation(input(), { enabled: false, frequency: 'once', scheduledAt: NOW });
    await expect(rescheduleReview(id, NOW - 1)).rejects.toBeInstanceOf(ValidationError);
    await rescheduleReview(id, at(2026, 1, 15, 8));
    const repos = createRepositories(db);
    expect(await repos.reminders.findByInformationId(id)).toMatchObject({ frequency: 'once', scheduledAt: at(2026, 1, 15, 8), isActive: true });
    expect((await repos.reviewHistory.findByInformationId(id))[0].status).toBe('rescheduled');
  });

  it('deactivates reminders, cancels notifications, and refuses to reactivate a past one-time reminder', async () => {
    const { id } = await saveInformation(input(), { enabled: true, frequency: 'once', scheduledAt: at(2026, 1, 11, 9) });
    await setReminderActive(id, false);
    expect(mockedNotifee.cancelNotification).toHaveBeenCalledWith(`info-${id}`);
    await expect(setReminderActive(id, true, at(2026, 1, 12))).rejects.toBeInstanceOf(ValidationError);
  });

  it('deletes information and cancels its notification', async () => {
    const { id } = await saveInformation(input(), { enabled: true, frequency: 'weekly', scheduledAt: at(2026, 1, 11, 9) });
    await deleteInformation(id);
    expect(mockedNotifee.cancelNotification).toHaveBeenCalledWith(`info-${id}`);
    expect(await listInformation({})).toHaveLength(0);
  });

  it('moves items to "Other" when a custom category is deleted', async () => {
    const categoryId = await createCategory('Arabic', '#E74694', 'translate');
    const { id } = await saveInformation(input({ categoryId }), { enabled: false, frequency: 'once', scheduledAt: NOW });
    await deleteCategory(categoryId);
    const [item] = await listInformation({});
    expect(item.id).toBe(id);
    expect(item.category?.name).toBe('Other');
  });

  it('sorts by next reminder with items without reminders last', async () => {
    await saveInformation(input({ title: 'None' }), { enabled: false, frequency: 'once', scheduledAt: NOW });
    await saveInformation(input({ title: 'Later' }), { enabled: true, frequency: 'once', scheduledAt: at(2026, 3, 1) });
    await saveInformation(input({ title: 'Soon' }), { enabled: true, frequency: 'once', scheduledAt: at(2026, 1, 11) });
    expect((await listInformation({ sort: 'nextReminder' }, NOW)).map(i => i.title)).toEqual(['Soon', 'Later', 'None']);
  });
});
