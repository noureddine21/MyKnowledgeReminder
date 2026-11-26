import { getDatabase } from '../src/database/connection';
import { createRepositories } from '../src/database/repositories';
import type { AppDatabase } from '../src/database/types';
import { saveInformation } from '../src/services/informationService';
import { gradeReview, recordPractice } from '../src/services/reviewService';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));

const at = (d: number, h = 9, m = 0) => new Date(2026, 10, d, h, m).getTime();

describe('quiz grades', () => {
  let db: AppDatabase;
  let nowSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDatabase();
    (getDatabase as jest.Mock).mockResolvedValue(db);
    // Items are saved on 22 Nov: day 1 (21 Nov) is past, day 3 (23 Nov) is the next step.
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(at(22, 12));
  });

  afterEach(() => {
    nowSpy.mockRestore();
    db.close();
  });

  const spacedItem = async () => {
    // Smart schedule 1/3/7/30 days after creation (20 Nov), at 09:00.
    const { id } = await saveInformation(
      { title: 'Hadith', content: 'Actions are by intentions', categoryId: 2, source: null, createdAt: at(20, 8) },
      { enabled: true, frequency: 'spaced', scheduledAt: at(20, 9) },
    );
    return id;
  };

  it('Good = normal review (next step), Easy = skips one step', async () => {
    const repos = createRepositories(db);
    const good = await spacedItem();
    const before = await repos.reminders.findByInformationId(good);
    expect(before).toMatchObject({ spacedStep: 1, scheduledAt: at(23) }); // day 3 is the first future step

    await gradeReview(good, 'good', at(23, 10));
    expect(await repos.reminders.findByInformationId(good)).toMatchObject({ spacedStep: 2, scheduledAt: at(27) });

    const easy = await spacedItem();
    await gradeReview(easy, 'easy', at(23, 10));
    expect(await repos.reminders.findByInformationId(easy)).toMatchObject({ spacedStep: 3, scheduledAt: at(50) });
  });

  it('Hard = the item comes back tomorrow at the same time, without losing progress', async () => {
    const repos = createRepositories(db);
    const id = await spacedItem();
    await gradeReview(id, 'hard', at(23, 10));
    expect(await repos.reminders.findByInformationId(id)).toMatchObject({
      spacedStep: 1,
      scheduledAt: at(24),
      isActive: true,
      lastReviewedAt: at(23, 10),
    });
    expect(await repos.reviewHistory.findByInformationId(id)).toHaveLength(1);
  });

  it('Practice only records the review, without touching the schedule', async () => {
    const repos = createRepositories(db);
    const id = await spacedItem();
    const before = await repos.reminders.findByInformationId(id);
    await recordPractice(id, at(21, 12));
    expect(await repos.reminders.findByInformationId(id)).toEqual(before);
    expect(await repos.reviewHistory.findByInformationId(id)).toHaveLength(1);
  });
});
