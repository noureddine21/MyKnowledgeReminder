import { getDatabase } from '../src/database/connection';
import { createRepositories } from '../src/database/repositories';
import type { AppDatabase } from '../src/database/types';
import { saveInformation } from '../src/services/informationService';
import { organizeToday, setPlanTaskDone } from '../src/services/planService';
import { computeStreaks, distinctDays, getStats } from '../src/services/statsService';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));

const at = (d: number, h = 10) => new Date(2026, 10, d, h).getTime();
const DAY_OFF = { dayStart: '08:00', dayEnd: '22:00', workStart: null, workEnd: null };

describe('statistics & streaks', () => {
  it('computes current and best streaks', () => {
    const days = distinctDays([at(10), at(11), at(11, 20), at(12), at(20), at(21), at(22), at(23)]);
    expect(computeStreaks(days, at(23, 22))).toEqual({ current: 4, best: 4 });
    // Not reviewed yet today: yesterday's streak still counts.
    expect(computeStreaks(days, at(24, 9))).toEqual({ current: 4, best: 4 });
    // A missed day breaks it.
    expect(computeStreaks(days, at(25, 9))).toEqual({ current: 0, best: 4 });
    expect(computeStreaks([], at(1))).toEqual({ current: 0, best: 0 });
  });

  describe('from the database', () => {
    let db: AppDatabase;

    beforeEach(async () => {
      db = await createTestDatabase();
      (getDatabase as jest.Mock).mockResolvedValue(db);
    });

    afterEach(() => db.close());

    it('aggregates reviews, items, categories and planner completion', async () => {
      const { id } = await saveInformation(
        { title: 'Ayat', content: 'x', categoryId: 1, source: null, createdAt: at(1) },
        { enabled: false, frequency: 'once', scheduledAt: at(1) },
      );
      const repos = createRepositories(db);
      await repos.reviewHistory.add(id, 'reviewed', at(25));
      await repos.reviewHistory.add(id, 'reviewed', at(26));
      await repos.reviewHistory.add(id, 'reviewed', at(26, 12));
      await repos.reviewHistory.add(id, 'rescheduled', at(26, 13)); // not a review

      const { plan } = await organizeToday('A 30m\nB 30m', at(26, 8), DAY_OFF);
      await setPlanTaskDone(plan.tasks[0].id, true, at(26, 9));

      const stats = await getStats(at(26, 18));
      expect(stats).toMatchObject({
        currentStreak: 2,
        bestStreak: 2,
        reviewedToday: true,
        reviewsThisWeek: 3,
        totalReviews: 3,
        totalItems: 1,
        planner: { planned: 2, done: 1, daysPlanned: 1 },
      });
      expect(stats.lastWeek.map(d => d.count)).toEqual([0, 0, 0, 0, 0, 1, 2]);
      expect(stats.byCategory).toEqual([{ name: 'Quran', color: '#0E9F6E', count: 1 }]);
    });
  });
});
