import { getDatabase } from '../src/database/connection';
import type { AppDatabase } from '../src/database/types';
import { createBackup } from '../src/services/backupService';
import { getInformation, listInformation, saveInformation } from '../src/services/informationService';
import { createTag, deleteTag, listTags, normalizeTagName } from '../src/services/tagService';
import { ValidationError } from '../src/utils/errors';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));

const NOW = new Date(2026, 10, 27, 9).getTime();

describe('tags', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
    (getDatabase as jest.Mock).mockResolvedValue(db);
  });

  afterEach(() => db.close());

  const save = (title: string, tagIds: number[]) =>
    saveInformation(
      { title, content: `${title} content`, categoryId: null, source: null, createdAt: NOW, tagIds },
      { enabled: false, frequency: 'once', scheduledAt: NOW },
    );

  it('normalizes names and refuses duplicates (case-insensitive)', async () => {
    expect(normalizeTagName('  #Tafsir Ibn Kathir ')).toBe('tafsir-ibn-kathir');
    const tag = await createTag('#Exam', NOW);
    expect(tag.name).toBe('exam');
    await expect(createTag('EXAM', NOW)).rejects.toBeInstanceOf(ValidationError);
    await expect(createTag('  ', NOW)).rejects.toBeInstanceOf(ValidationError);
  });

  it('saves tags with an item, filters by tag and counts usage', async () => {
    const tafsir = await createTag('tafsir', NOW);
    const exam = await createTag('exam', NOW);
    const { id: a } = await save('Ayat al-Kursi', [tafsir.id, exam.id]);
    await save('Azure', [exam.id]);
    await save('Untagged', []);

    expect((await getInformation(a))?.tags?.map(t => t.name)).toEqual(['exam', 'tafsir']);
    expect((await listInformation({ tagId: tafsir.id })).map(i => i.title)).toEqual(['Ayat al-Kursi']);
    expect((await listInformation({ tagId: exam.id })).map(i => i.title).sort()).toEqual(['Ayat al-Kursi', 'Azure']);
    expect((await listTags()).map(t => [t.name, t.itemCount])).toEqual([
      ['exam', 2],
      ['tafsir', 1],
    ]);

    // Editing replaces the tags.
    await saveInformation(
      { title: 'Ayat al-Kursi', content: 'x', categoryId: null, source: null, createdAt: NOW, tagIds: [tafsir.id] },
      { enabled: false, frequency: 'once', scheduledAt: NOW },
      a,
    );
    expect((await getInformation(a))?.tags?.map(t => t.name)).toEqual(['tafsir']);
  });

  it('deleting a tag keeps the items; backups include tags', async () => {
    const tag = await createTag('work', NOW);
    const { id } = await save('Report', [tag.id]);
    const backup = await createBackup(NOW);
    expect(backup.tables.tags).toHaveLength(1);
    expect(backup.tables.information_tags).toHaveLength(1);

    await deleteTag(tag.id);
    expect((await getInformation(id))?.tags).toEqual([]);
    expect(await getInformation(id)).not.toBeNull();
  });
});
