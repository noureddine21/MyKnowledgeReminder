import { getSchemaVersion, MIGRATIONS, runMigrations } from '../src/database/migrations';
import { createRepositories, type Repositories } from '../src/database/repositories';
import type { AppDatabase } from '../src/database/types';
import { ValidationError } from '../src/utils/errors';
import { createTestDatabase } from '../test-utils/testDatabase';

const NOW = new Date(2026, 0, 10, 9, 0).getTime();

describe('SQLite schema & repositories', () => {
  let db: AppDatabase;
  let repos: Repositories;

  beforeEach(async () => {
    db = await createTestDatabase();
    repos = createRepositories(db);
  });

  afterEach(() => db.close());

  it('applies migrations once and records the version', async () => {
    expect(await getSchemaVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    // Running again is a no-op.
    await runMigrations(db);
    const categories = await repos.categories.findAll();
    expect(categories.map(c => c.name)).toEqual(
      expect.arrayContaining(['Quran', 'Hadith', 'Technology', 'French', 'Personal Notes', 'Other']),
    );
    expect(categories).toHaveLength(6);
  });

  it('creates, reads, updates and deletes information', async () => {
    const quran = await repos.categories.findByName('quran');
    const id = await repos.information.insert(
      { title: ' Ayat al-Kursi ', content: 'Allah! There is no deity except Him', categoryId: quran!.id, source: '2:255', createdAt: NOW },
      NOW,
    );
    let item = await repos.information.findById(id);
    expect(item?.title).toBe('Ayat al-Kursi');
    expect(item?.category?.name).toBe('Quran');
    expect(item?.reminder).toBeNull();

    await repos.information.update(id, { ...item!, title: 'Updated', source: null }, NOW + 1000);
    item = await repos.information.findById(id);
    expect(item?.title).toBe('Updated');
    expect(item?.source).toBeNull();
    expect(item?.updatedAt).toBe(NOW + 1000);

    await repos.information.delete(id);
    expect(await repos.information.findById(id)).toBeNull();
  });

  it('cascades reminder and history deletion through foreign keys', async () => {
    const id = await repos.information.insert(
      { title: 'T', content: 'C', categoryId: null, source: null, createdAt: NOW },
      NOW,
    );
    await repos.reminders.upsert(id, { scheduledAt: NOW + 1, frequency: 'daily', repeatInterval: 1, isActive: true, spacedStep: 0, spacedBaseAt: null }, NOW);
    await repos.reviewHistory.add(id, 'reviewed', NOW);
    await repos.information.delete(id);
    const reminders = await db.execute('SELECT COUNT(*) AS n FROM reminders');
    const history = await db.execute('SELECT COUNT(*) AS n FROM review_history');
    expect(Number(reminders.rows[0].n)).toBe(0);
    expect(Number(history.rows[0].n)).toBe(0);
  });

  it('upserts a single reminder per item', async () => {
    const id = await repos.information.insert(
      { title: 'T', content: 'C', categoryId: null, source: null, createdAt: NOW },
      NOW,
    );
    await repos.reminders.upsert(id, { scheduledAt: NOW + 1, frequency: 'once', repeatInterval: 1, isActive: true, spacedStep: 0, spacedBaseAt: null }, NOW);
    await repos.reminders.upsert(id, { scheduledAt: NOW + 2, frequency: 'weekly', repeatInterval: 1, isActive: true, spacedStep: 0, spacedBaseAt: null }, NOW);
    const all = await repos.reminders.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ scheduledAt: NOW + 2, frequency: 'weekly', isActive: true });
  });

  it('rejects invalid data with database constraints', async () => {
    await expect(
      db.execute("INSERT INTO reminders (information_id, scheduled_at, frequency, created_at, updated_at) VALUES (999, 1, 'daily', 1, 1)"),
    ).rejects.toThrow();
    await expect(
      db.execute("INSERT INTO information (title, content, created_at, updated_at) VALUES ('  ', 'x', 1, 1)"),
    ).rejects.toThrow();
  });

  it('searches literally (wildcards escaped) and filters by category', async () => {
    const tech = await repos.categories.findByName('Technology');
    await repos.information.insert({ title: '100% coverage', content: 'tests', categoryId: tech!.id, source: null, createdAt: NOW }, NOW);
    await repos.information.insert({ title: 'Azure', content: 'Artifacts feed', categoryId: tech!.id, source: 'learn', createdAt: NOW + 1 }, NOW);
    await repos.information.insert({ title: 'Bonjour', content: 'hello', categoryId: null, source: null, createdAt: NOW + 2 }, NOW);

    expect((await repos.information.findAll({ search: '%' })).map(i => i.title)).toEqual(['100% coverage']);
    expect((await repos.information.findAll({ search: 'artifacts' })).map(i => i.title)).toEqual(['Azure']);
    expect((await repos.information.findAll({ categoryId: tech!.id })).length).toBe(2);
    expect((await repos.information.findAll({ sort: 'createdAsc' }))[0].title).toBe('100% coverage');
    expect((await repos.information.findAll({ sort: 'createdDesc' }))[0].title).toBe('Bonjour');
  });

  it('enforces unique category names (case-insensitive)', async () => {
    await repos.categories.create('Arabic', '#000000', 'translate', NOW);
    await expect(repos.categories.create('arabic', '#111111', 'translate', NOW)).rejects.toBeInstanceOf(ValidationError);
  });

  it('stores and parses settings', async () => {
    expect((await repos.settings.getAll()).reviewIntervals).toEqual([1, 3, 7, 30]);
    await repos.settings.set('reviewIntervals', [2, 5, 10]);
    await repos.settings.set('themeMode', 'dark');
    await repos.settings.set('useSmartScheduleByDefault', false);
    const settings = await repos.settings.getAll();
    expect(settings).toMatchObject({ reviewIntervals: [2, 5, 10], themeMode: 'dark', useSmartScheduleByDefault: false });
  });

  it('rolls back a failed transaction', async () => {
    await expect(
      db.transaction(async tx => {
        await tx.execute("INSERT INTO information (title, content, created_at, updated_at) VALUES ('A', 'B', 1, 1)");
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repos.information.count()).toBe(0);
  });
});
