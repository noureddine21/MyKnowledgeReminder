import { getDatabase } from '../src/database/connection';
import { createRepositories } from '../src/database/repositories';
import type { AppDatabase } from '../src/database/types';
import {
  BACKUP_APP,
  backupFileName,
  createBackup,
  parseBackup,
  restoreBackup,
} from '../src/services/backupService';
import { saveInformation } from '../src/services/informationService';
import { organizeToday } from '../src/services/planService';
import { AppError } from '../src/utils/errors';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));

const NOW = new Date(2026, 10, 26, 8, 0).getTime();
const DAY_OFF = { dayStart: '08:00', dayEnd: '22:00', workStart: null, workEnd: null };

describe('backup & restore', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDatabase();
    (getDatabase as jest.Mock).mockResolvedValue(db);
  });

  afterEach(() => db.close());

  const seed = async () => {
    await saveInformation(
      { title: 'Ayat al-Kursi', content: 'Allah — there is no deity except Him', categoryId: 1, source: 'Al-Baqarah 255', createdAt: NOW },
      { enabled: true, frequency: 'daily', scheduledAt: NOW + 3_600_000 },
    );
    await saveInformation(
      { title: 'Azure Artifacts', content: 'Feeds and upstream sources', categoryId: 3, source: null, createdAt: NOW },
      { enabled: false, frequency: 'once', scheduledAt: NOW },
    );
    await organizeToday('Sport 1h\nRead 20m', NOW, DAY_OFF);
    await createRepositories(db).settings.set('themeMode', 'dark');
  };

  it('exports every table with metadata', async () => {
    await seed();
    const backup = await createBackup(NOW);
    expect(backup).toMatchObject({ app: BACKUP_APP, format: 1, exportedAt: NOW });
    expect(backup.tables.information).toHaveLength(2);
    expect(backup.tables.reminders).toHaveLength(1);
    expect(backup.tables.plan_tasks).toHaveLength(2);
    expect(backupFileName(NOW)).toBe('my-knowledge-backup-2026-11-26.json');
  });

  it('restores a backup into another (empty) database, replacing its data', async () => {
    await seed();
    const text = JSON.stringify(await createBackup(NOW));

    // "New phone": a fresh database with different content.
    const fresh = await createTestDatabase();
    (getDatabase as jest.Mock).mockResolvedValue(fresh);
    await saveInformation(
      { title: 'Will be replaced', content: 'x', categoryId: null, source: null, createdAt: NOW },
      { enabled: false, frequency: 'once', scheduledAt: NOW },
    );

    const summary = await restoreBackup(await parseBackup(text), NOW);
    expect(summary).toMatchObject({ items: 2, plans: 1 });

    const repos = createRepositories(fresh);
    const items = await repos.information.findAll();
    expect(items.map(i => i.title).sort()).toEqual(['Ayat al-Kursi', 'Azure Artifacts']);
    expect(items.find(i => i.title === 'Ayat al-Kursi')?.reminder).toMatchObject({ frequency: 'daily', isActive: true });
    expect((await repos.settings.getAll()).themeMode).toBe('dark');
    fresh.close();
  });

  it('rejects files that are not backups, and backups from a newer app', async () => {
    await expect(parseBackup('hello')).rejects.toBeInstanceOf(AppError);
    await expect(parseBackup(JSON.stringify({ app: 'Other', format: 1, schemaVersion: 1, tables: {} }))).rejects.toThrow(
      'not a My Knowledge Reminder backup',
    );
    await expect(
      parseBackup(JSON.stringify({ app: BACKUP_APP, format: 1, schemaVersion: 999, exportedAt: 1, tables: {} })),
    ).rejects.toThrow('newer version');
  });

  it('keeps current data when a backup is damaged', async () => {
    await seed();
    const backup = await createBackup(NOW);
    // Second item references a category that does not exist -> FK failure mid-restore.
    backup.tables.information = [...backup.tables.information, { ...backup.tables.information[0], id: 99, category_id: 12345 }];
    await expect(restoreBackup(backup, NOW)).rejects.toThrow('Your current data was kept');
    expect(await createRepositories(db).information.count()).toBe(2);
  });
});
