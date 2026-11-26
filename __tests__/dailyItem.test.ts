import notifee from 'react-native-notify-kit';
import { getDatabase } from '../src/database/connection';
import { createRepositories } from '../src/database/repositories';
import type { AppDatabase } from '../src/database/types';
import { pickItems, scheduleDailyItems } from '../src/services/dailyItemService';
import { saveInformation } from '../src/services/informationService';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const mockedNotifee = notifee as jest.Mocked<typeof notifee>;

describe('item of the day', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDatabase();
    (getDatabase as jest.Mock).mockResolvedValue(db);
  });

  afterEach(() => db.close());

  const add = (title: string, categoryId: number) =>
    saveInformation(
      { title, content: `${title} content`, categoryId, source: null, createdAt: at(1, 8) },
      { enabled: false, frequency: 'once', scheduledAt: at(1, 8) },
    );

  it('does not repeat an item before all were used', () => {
    const picked = pickItems(['a', 'b', 'c'], 7, () => 0);
    expect(picked).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'a']);
    expect(pickItems([], 7)).toEqual([]);
  });

  it('schedules the next 7 mornings, only from Quran & Hadith when chosen', async () => {
    await add('Ayat al-Kursi', 1); // Quran
    await add('Intentions', 2); // Hadith
    await add('Azure Artifacts', 3); // Technology
    await createRepositories(db).settings.set('dailyItemSource', 'faith');

    const count = await scheduleDailyItems(at(26, 9)); // after 08:00 -> starts tomorrow
    expect(count).toBe(7);
    const calls = mockedNotifee.createTriggerNotification.mock.calls.filter(([n]) => n.id?.startsWith('daily-item-'));
    expect(calls.map(([, t]) => (t as { timestamp: number }).timestamp)[0]).toBe(at(27, 8));
    expect(calls.every(([n]) => !String(n.title).includes('Azure'))).toBe(true);
    expect(calls[0][0].data).toHaveProperty('informationId');
  });

  it('schedules nothing when disabled or the library is empty', async () => {
    expect(await scheduleDailyItems(at(26, 7))).toBe(0);
    await add('Note', 5);
    await createRepositories(db).settings.set('dailyItemEnabled', false);
    expect(await scheduleDailyItems(at(26, 7))).toBe(0);
  });
});
