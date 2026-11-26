import notifee, { RepeatFrequency } from 'react-native-notify-kit';
import { getDatabase } from '../src/database/connection';
import { migration001 } from '../src/database/migrations/001_initial';
import { getSchemaVersion, MIGRATIONS, runMigrations } from '../src/database/migrations';
import { createRepositories } from '../src/database/repositories';
import type { AppDatabase } from '../src/database/types';
import type { Reminder } from '../src/models';
import { saveInformation } from '../src/services/informationService';
import {
  getDueAt,
  getNotificationTimestamp,
  isDueToday,
  latestOccurrenceOnOrBefore,
  nextOccurrenceAfter,
} from '../src/services/reviewSchedule';
import { ValidationError } from '../src/utils/errors';
import { formatRecurrence } from '../src/utils/recurrence';
import { validateInformation } from '../src/utils/validation';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));

const at = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 1, 10, 12);
const mockedNotifee = notifee as jest.Mocked<typeof notifee>;

function reminder(patch: Partial<Reminder>): Reminder {
  return {
    id: 1,
    informationId: 1,
    scheduledAt: at(2026, 1, 10),
    frequency: 'hourly',
    repeatInterval: 1,
    isActive: true,
    notificationId: null,
    spacedStep: 0,
    spacedBaseAt: null,
    lastReviewedAt: null,
    createdAt: at(2026, 1, 1),
    updatedAt: at(2026, 1, 1),
    ...patch,
  };
}

describe('custom repeat: schedule logic', () => {
  it('computes "every N hours/days/weeks/months" occurrences', () => {
    expect(nextOccurrenceAfter(at(2026, 1, 10, 9), 'hourly', at(2026, 1, 10, 12, 30), 2)).toBe(at(2026, 1, 10, 13));
    expect(nextOccurrenceAfter(at(2026, 1, 10, 9), 'hourly', at(2026, 1, 10, 9, 10))).toBe(at(2026, 1, 10, 10));
    expect(nextOccurrenceAfter(at(2026, 1, 1, 9), 'daily', at(2026, 1, 5, 10), 3)).toBe(at(2026, 1, 7, 9));
    expect(latestOccurrenceOnOrBefore(at(2026, 1, 5, 9), 'weekly', at(2026, 1, 30), 2)).toBe(at(2026, 1, 19, 9));
    expect(nextOccurrenceAfter(at(2026, 1, 31, 9), 'monthly', at(2026, 2, 1), 3)).toBe(at(2026, 4, 30, 9));
  });

  it('makes an hourly item due once its occurrence fired, until reviewed', () => {
    const r = reminder({ scheduledAt: at(2026, 1, 10, 9), repeatInterval: 2 });
    expect(getDueAt(r, NOW)).toBe(at(2026, 1, 10, 11));
    expect(isDueToday(r, NOW)).toBe(true);
    expect(isDueToday({ ...r, lastReviewedAt: at(2026, 1, 10, 11, 5) }, NOW)).toBe(false);
    // Next occurrence (13:00) makes it due again.
    expect(isDueToday({ ...r, lastReviewedAt: at(2026, 1, 10, 11, 5) }, at(2026, 1, 10, 13, 1))).toBe(true);
    // Series not started yet: not due.
    expect(isDueToday(reminder({ scheduledAt: at(2026, 1, 10, 15) }), NOW)).toBe(false);
    expect(getNotificationTimestamp(r, NOW)).toBe(at(2026, 1, 10, 13));
  });

  it('formats recurrences for display', () => {
    expect(formatRecurrence('hourly', 1)).toBe('Every hour');
    expect(formatRecurrence('hourly', 6)).toBe('Every 6 hours');
    expect(formatRecurrence('daily', 3)).toBe('Every 3 days');
    expect(formatRecurrence('once', 1)).toBe('');
  });

  it('validates the interval', () => {
    const info = { title: 'T', content: 'C', categoryId: null, source: null, createdAt: NOW };
    const base = { enabled: true, frequency: 'daily' as const, scheduledAt: NOW + 1000 };
    expect(validateInformation(info, { ...base, repeatInterval: 3 }, NOW).repeatInterval).toBeUndefined();
    expect(validateInformation(info, { ...base, repeatInterval: 0 }, NOW).repeatInterval).toBeDefined();
    expect(validateInformation(info, { ...base, repeatInterval: 1000 }, NOW).repeatInterval).toBeDefined();
  });
});

describe('custom repeat: database + notifications', () => {
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

  it('saves "every 6 hours" and schedules a native hourly trigger with interval 6', async () => {
    const { id } = await saveInformation(
      { title: 'Dua', content: 'Text', categoryId: null, source: null, createdAt: NOW },
      { enabled: true, frequency: 'hourly', repeatInterval: 6, scheduledAt: at(2026, 1, 10, 8) },
    );
    expect(await createRepositories(db).reminders.findByInformationId(id)).toMatchObject({
      frequency: 'hourly',
      repeatInterval: 6,
    });
    const [, trigger] = mockedNotifee.createTriggerNotification.mock.calls[0];
    expect(trigger).toMatchObject({
      timestamp: at(2026, 1, 10, 14),
      repeatFrequency: RepeatFrequency.HOURLY,
      repeatInterval: 6,
    });
  });

  it('rejects an invalid interval before writing', async () => {
    await expect(
      saveInformation(
        { title: 'T', content: 'C', categoryId: null, source: null, createdAt: NOW },
        { enabled: true, frequency: 'daily', repeatInterval: 0, scheduledAt: NOW + 1000 },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await createRepositories(db).information.count()).toBe(0);
  });
});

describe('migration 002 (repeat interval)', () => {
  it('upgrades a version-1 database and keeps existing reminders', async () => {
    const db = await createTestDatabase({ migrate: false });
    await runMigrations(db, [migration001]);
    await db.execute(
      "INSERT INTO information (title, content, created_at, updated_at) VALUES ('Old', 'Item', 1, 1)",
    );
    await db.execute(
      "INSERT INTO reminders (information_id, scheduled_at, frequency, created_at, updated_at) VALUES (1, 5, 'weekly', 1, 1)",
    );

    const latest = MIGRATIONS[MIGRATIONS.length - 1].version;
    expect(await runMigrations(db)).toBe(latest);
    expect(await getSchemaVersion(db)).toBe(latest);

    const repos = createRepositories(db);
    expect(await repos.reminders.findByInformationId(1)).toMatchObject({
      frequency: 'weekly',
      repeatInterval: 1,
      scheduledAt: 5,
    });
    // New frequency accepted; deleting the item still cascades to its reminder.
    await repos.reminders.upsert(
      1,
      { scheduledAt: 10, frequency: 'hourly', repeatInterval: 4, isActive: true, spacedStep: 0, spacedBaseAt: null },
      2,
    );
    await repos.information.delete(1);
    expect(await repos.reminders.findAll()).toHaveLength(0);
    db.close();
  });
});
