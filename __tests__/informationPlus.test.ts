import { getDatabase } from '../src/database/connection';
import type { AppDatabase } from '../src/database/types';
import type { InformationItem, ReminderInput } from '../src/models';
import { createBackup, restoreBackup } from '../src/services/backupService';
import {
  createCollection,
  deleteCollection,
  listCollections,
  moveInCollection,
} from '../src/services/collectionService';
import {
  deleteInformation,
  findSimilarInformation,
  getInformation,
  getLinkedItems,
  getMasteryCounts,
  linkInformation,
  listInformation,
  saveInformation,
  setFavorite,
  unlinkInformation,
} from '../src/services/informationService';
import { masteryLevel, nextMastery } from '../src/services/mastery';
import { gradeReview, recordPractice } from '../src/services/reviewService';
import { buildSessionItems, formatCountdown } from '../src/services/reviewSession';
import { findMostSimilar, normalizeText, textSimilarity } from '../src/services/similarity';
import { applyTemplate } from '../src/services/templates';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('../src/native/mkrNative', () => ({
  isNativeAvailable: () => false,
  deleteAppFile: jest.fn(async () => {}),
  cancelNativeAlarm: jest.fn(async () => {}),
  cancelNativeAlarmsWithPrefix: jest.fn(async () => {}),
  scheduleNativeAlarm: jest.fn(async () => true),
  updateWidget: jest.fn(async () => 0),
}));

const { deleteAppFile } = jest.requireMock('../src/native/mkrNative') as { deleteAppFile: jest.Mock };

const NO_REMINDER: ReminderInput = { enabled: false, frequency: 'once', scheduledAt: Date.now() + 86_400_000 };

async function add(title: string, extra: Partial<Parameters<typeof saveInformation>[0]> = {}): Promise<number> {
  const { id } = await saveInformation({ title, content: `${title} content`, categoryId: null, source: null, createdAt: Date.now(), ...extra }, NO_REMINDER);
  return id;
}

describe('mastery', () => {
  it('moves with each answer and never goes back to "new"', () => {
    expect(nextMastery(0, 'good')).toBe(1);
    expect(nextMastery(0, 'hard')).toBe(1);
    expect(nextMastery(3, 'hard')).toBe(2);
    expect(nextMastery(4, 'easy')).toBe(5);
    expect(nextMastery(5, 'good')).toBe(5);
    expect([0, 1, 2, 3, 4, 5].map(masteryLevel)).toEqual(['new', 'learning', 'learning', 'known', 'known', 'mastered']);
  });
});

describe('duplicate detection', () => {
  it('normalizes accents, case and Arabic diacritics', () => {
    expect(normalizeText('  Éphémère, CAFÉ! ')).toBe('ephemere cafe');
    expect(normalizeText('الْحَمْدُ لِلَّهِ')).toBe(normalizeText('الحمد لله'));
  });

  it('finds the same title or a very similar content', () => {
    const items = [
      { id: 1, title: 'Ayat al-Kursi', content: 'Allah, there is no deity except Him, the Ever-Living' },
      { id: 2, title: 'Patience', content: 'Indeed Allah is with the patient ones' },
    ];
    expect(findMostSimilar({ title: 'ayat al kursi', content: 'x' }, items)?.id).toBe(1);
    expect(findMostSimilar({ title: 'Sabr', content: 'Indeed, Allah is with the patient ones.' }, items)?.id).toBe(2);
    expect(findMostSimilar({ title: 'Sabr', content: 'Something completely different here' }, items)).toBeNull();
    expect(findMostSimilar({ title: 'Patience', content: '' }, items, 2)).toBeNull();
    expect(textSimilarity('a b c d', 'a b c d')).toBe(0);
    expect(textSimilarity('one two three four', 'one two three four')).toBe(1);
  });
});

describe('templates', () => {
  it('builds title, source and question', () => {
    expect(applyTemplate('verse', { surah: 'Al-Baqarah', ayah: '255' }, '')).toEqual({
      title: 'Surah Al-Baqarah 255',
      source: 'Surah Al-Baqarah 255',
      question: 'Recite Surah Al-Baqarah 255',
    });
    expect(applyTemplate('hadith', { narrator: 'Umar', book: 'Bukhari', number: '1' }, '')).toEqual({
      title: 'Hadith — Bukhari 1',
      source: 'Narrated by Umar · Bukhari 1',
    });
    expect(applyTemplate('quote', { author: 'Ibn al-Qayyim' }, '').question).toBe('What did Ibn al-Qayyim say?');
    expect(applyTemplate('word', { word: 'éphémère', translation: 'short-lived', example: 'Un bonheur éphémère.' }, 'syn: fugace')).toEqual({
      title: 'éphémère',
      question: 'What does "éphémère" mean?',
      content: 'short-lived\n\nExample: Un bonheur éphémère.\n\nsyn: fugace',
    });
    expect(applyTemplate('verse', {}, '')).toEqual({});
  });
});

describe('timed session', () => {
  const item = (id: number, mastery: number, lastReviewedAt: number | null = null) =>
    ({ id, mastery, createdAt: id, reminder: lastReviewedAt === null ? null : { lastReviewedAt } }) as unknown as InformationItem;

  it('puts due items first, then the least known and least recently seen', () => {
    const due = [item(9, 4)];
    const all = [item(9, 4), item(1, 3), item(2, 0), item(3, 1, 500), item(4, 1, 100)];
    expect(buildSessionItems(due, all).map(i => i.id)).toEqual([9, 2, 4, 3, 1]);
    expect(buildSessionItems(due, all, 2).map(i => i.id)).toEqual([9, 2]);
    expect(formatCountdown(65_000)).toBe('1:05');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});

describe('information plus (database)', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDatabase();
    (getDatabase as jest.Mock).mockResolvedValue(db);
  });

  afterEach(() => db.close());

  it('saves the flashcard question, favorite, photo and voice note', async () => {
    const id = await add('Word', {
      question: '  What does it mean? ',
      isFavorite: true,
      imagePath: 'file:///data/media/img_1.jpg',
      audioPath: 'file:///data/media/voice_1.m4a',
    });
    const item = await getInformation(id);
    expect(item).toMatchObject({
      question: 'What does it mean?',
      isFavorite: true,
      mastery: 0,
      imagePath: 'file:///data/media/img_1.jpg',
      audioPath: 'file:///data/media/voice_1.m4a',
    });

    // Replacing the photo deletes the old file; deleting the item deletes the rest.
    await saveInformation(
      { title: 'Word', content: 'Word content', categoryId: null, source: null, createdAt: item!.createdAt, imagePath: 'file:///data/media/img_2.jpg', audioPath: item!.audioPath },
      NO_REMINDER,
      id,
    );
    expect(deleteAppFile).toHaveBeenCalledWith('file:///data/media/img_1.jpg');
    await deleteInformation(id);
    expect(deleteAppFile).toHaveBeenCalledWith('file:///data/media/img_2.jpg');
    expect(deleteAppFile).toHaveBeenCalledWith('file:///data/media/voice_1.m4a');
  });

  it('lists favorites first and filters by status', async () => {
    const a = await add('A');
    const b = await add('B');
    await setFavorite(a, true);
    expect((await listInformation({ sort: 'createdDesc' })).map(i => i.title)).toEqual(['A', 'B']);
    expect((await listInformation({ status: 'favorites' })).map(i => i.id)).toEqual([a]);

    await recordPractice(b, Date.now(), 'easy'); // 0 → 2 learning
    await recordPractice(b, Date.now(), 'easy'); // → 4 known
    expect((await listInformation({ status: 'known' })).map(i => i.id)).toEqual([b]);
    expect((await listInformation({ status: 'new' })).map(i => i.id)).toEqual([a]);
    expect(await getMasteryCounts()).toEqual([1, 0, 0, 0, 1, 0]);
    expect((await listInformation({ search: 'mean' })).length).toBe(0);
  });

  it('updates the mastery from quiz grades', async () => {
    const id = await add('Q');
    await gradeReview(id, 'good');
    await gradeReview(id, 'easy');
    expect((await getInformation(id))!.mastery).toBe(3);
    await gradeReview(id, 'hard');
    expect((await getInformation(id))!.mastery).toBe(2);
  });

  it('keeps collections in order with progress', async () => {
    const col = await createCollection('40 Hadith');
    const one = await add('One', { collectionId: col.id });
    const two = await add('Two', { collectionId: col.id });
    const three = await add('Three', { collectionId: col.id });
    const order = async () => (await listInformation({ collectionId: col.id })).map(i => i.title);
    expect(await order()).toEqual(['One', 'Two', 'Three']);

    await moveInCollection(three, -1);
    expect(await order()).toEqual(['One', 'Three', 'Two']);
    await moveInCollection(one, -1); // already first: no change
    expect(await order()).toEqual(['One', 'Three', 'Two']);

    await recordPractice(two, Date.now(), 'easy');
    await recordPractice(two, Date.now(), 'good');
    expect(await listCollections()).toEqual([expect.objectContaining({ name: '40 Hadith', itemCount: 3, learnedCount: 1 })]);
    await expect(createCollection('40 hadith')).rejects.toThrow();

    await deleteCollection(col.id);
    expect((await getInformation(one))!.collectionId).toBeNull();
  });

  it('links items both ways ("see also")', async () => {
    const a = await add('A');
    const b = await add('B');
    const c = await add('C');
    await linkInformation(b, a);
    await linkInformation(a, c);
    await linkInformation(a, a);
    expect((await getLinkedItems(a)).map(i => i.title)).toEqual(['B', 'C']);
    expect((await getLinkedItems(b)).map(i => i.title)).toEqual(['A']);
    await unlinkInformation(c, a);
    expect((await getLinkedItems(a)).map(i => i.title)).toEqual(['B']);
    await deleteInformation(b);
    expect(await getLinkedItems(a)).toEqual([]);
  });

  it('warns about duplicates', async () => {
    await add('Ayat al-Kursi');
    expect((await findSimilarInformation({ title: 'Ayat Al Kursi', content: 'x' }))?.title).toBe('Ayat al-Kursi');
    expect(await findSimilarInformation({ title: 'Other', content: 'y' })).toBeNull();
  });

  it('backs up and restores collections and links', async () => {
    const col = await createCollection('Juz Amma');
    const a = await add('An-Nas', { collectionId: col.id, question: 'Recite An-Nas' });
    const b = await add('Al-Falaq', { collectionId: col.id });
    await linkInformation(a, b);
    const backup = await createBackup();
    expect(backup.tables.collections).toHaveLength(1);
    expect(backup.tables.information_links).toHaveLength(1);

    await deleteCollection(col.id);
    await deleteInformation(a);
    await restoreBackup(backup);
    expect((await getInformation(a))).toMatchObject({ question: 'Recite An-Nas', collectionId: col.id });
    expect((await getLinkedItems(a)).map(i => i.id)).toEqual([b]);
  });
});
