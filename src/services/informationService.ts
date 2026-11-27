import { getRepositories, inTransaction } from '../database/repositories';
import type { ReminderData } from '../database/repositories/reminderRepository';
import type {
  InformationInput,
  InformationItem,
  InformationQuery,
  Reminder,
  ReminderInput,
  ReviewHistoryEntry,
} from '../models';
import { toTimeString } from '../utils/date';
import { NotFoundError } from '../utils/errors';
import { assertValidInformation } from '../utils/validation';
import { cancelNotification, notificationIdFor, snoozeNotificationIdFor } from './notificationService';
import { syncItemNotification } from './reminderSync';
import { attachTags } from './tagService';
import { getNextReminderAt, initialSpacedSchedule, isDueToday, isRepeating } from './reviewSchedule';
import { findMostSimilar } from './similarity';
import { deleteAppFile } from '../native/mkrNative';

export interface SaveResult {
  id: number;
  /** Non-blocking problem (e.g. notification scheduling failed). */
  warning: string | null;
}

/** True when the user did not touch the reminder configuration while editing. */
export function isReminderUnchanged(
  existing: Reminder | null | undefined,
  input: ReminderInput,
  createdAt: number,
): boolean {
  if (!existing || !existing.isActive || !input.enabled || existing.frequency !== input.frequency) {
    return false;
  }
  if (isRepeating(input.frequency) && existing.repeatInterval !== (input.repeatInterval ?? 1)) {
    return false;
  }
  if (input.frequency === 'spaced') {
    return (
      existing.spacedBaseAt === createdAt &&
      toTimeString(existing.scheduledAt) === toTimeString(input.scheduledAt)
    );
  }
  return existing.scheduledAt === input.scheduledAt;
}

export function buildReminderData(
  input: ReminderInput,
  createdAt: number,
  intervals: number[],
  now: number,
): ReminderData {
  if (input.frequency === 'spaced') {
    const schedule = initialSpacedSchedule(createdAt, intervals, input.scheduledAt, now);
    if (schedule) {
      return {
        scheduledAt: schedule.scheduledAt,
        frequency: 'spaced',
        repeatInterval: 1,
        isActive: true,
        spacedStep: schedule.step,
        spacedBaseAt: createdAt,
        alarm: input.alarm ?? false,
      };
    }
  }
  return {
    scheduledAt: input.scheduledAt,
    frequency: input.frequency === 'spaced' ? 'once' : input.frequency,
    repeatInterval: isRepeating(input.frequency) ? input.repeatInterval ?? 1 : 1,
    isActive: true,
    spacedStep: 0,
    spacedBaseAt: null,
    alarm: input.alarm ?? false,
  };
}

/** Creates (no id) or updates an information item together with its reminder. */
export async function saveInformation(
  input: InformationInput,
  reminderInput: ReminderInput,
  existingId?: number,
): Promise<SaveResult> {
  const now = Date.now();
  const repos = await getRepositories();
  const settings = await repos.settings.getAll();

  let existing: InformationItem | null = null;
  if (existingId !== undefined) {
    existing = await repos.information.findById(existingId);
    if (!existing) {
      throw new NotFoundError('This information');
    }
  }

  const unchanged = isReminderUnchanged(existing?.reminder, reminderInput, input.createdAt);
  assertValidInformation(input, reminderInput, now, { requireFutureOnce: !unchanged });

  // Joining a collection puts the item at its end; staying keeps its place.
  const collectionId = input.collectionId ?? null;
  const position =
    collectionId === null
      ? null
      : existing && existing.collectionId === collectionId
        ? existing.collectionPosition
        : await repos.information.nextCollectionPosition(collectionId);
  // Files of a removed / replaced photo or voice note.
  const oldFiles = existing
    ? [existing.imagePath, existing.audioPath].filter(
        (p): p is string => !!p && p !== input.imagePath && p !== input.audioPath,
      )
    : [];

  const id = await inTransaction(async tx => {
    let itemId: number;
    if (existing) {
      itemId = existing.id;
      await tx.information.update(itemId, input, now, position);
    } else {
      itemId = await tx.information.insert(input, now, position);
    }
    if (input.tagIds !== undefined) {
      await tx.tags.setForItem(itemId, input.tagIds);
    }

    if (reminderInput.enabled) {
      const data: ReminderData =
        unchanged && existing?.reminder
          ? {
              scheduledAt: existing.reminder.scheduledAt,
              frequency: existing.reminder.frequency,
              repeatInterval: existing.reminder.repeatInterval,
              isActive: true,
              spacedStep: existing.reminder.spacedStep,
              spacedBaseAt: existing.reminder.spacedBaseAt,
              alarm: reminderInput.alarm ?? existing.reminder.alarm,
            }
          : buildReminderData(reminderInput, input.createdAt, settings.reviewIntervals, now);
      await tx.reminders.upsert(itemId, data, now);
    } else if (existing?.reminder) {
      // Keep the configuration so the user can turn it back on later.
      await tx.reminders.setActive(existing.reminder.id, false, now);
    }
    return itemId;
  });

  await Promise.all(oldFiles.map(path => deleteAppFile(path)));
  const warning = await syncItemNotification(id, now, { clearSnooze: true });
  return { id, warning };
}

export async function deleteInformation(id: number): Promise<void> {
  await cancelNotification(notificationIdFor(id));
  await cancelNotification(snoozeNotificationIdFor(id));
  const repos = await getRepositories();
  const item = await repos.information.findById(id);
  await repos.information.delete(id);
  await Promise.all([item?.imagePath, item?.audioPath].filter((p): p is string => !!p).map(path => deleteAppFile(path)));
}

export async function setFavorite(id: number, favorite: boolean): Promise<void> {
  const repos = await getRepositories();
  await repos.information.setFavorite(id, favorite);
}

/** "See also": items linked to this one. */
export async function getLinkedItems(id: number): Promise<InformationItem[]> {
  const repos = await getRepositories();
  return repos.information.findByIds(await repos.information.linkedIds(id));
}

export async function linkInformation(a: number, b: number, now: number = Date.now()): Promise<void> {
  const repos = await getRepositories();
  await repos.information.link(a, b, now);
}

export async function unlinkInformation(a: number, b: number): Promise<void> {
  const repos = await getRepositories();
  await repos.information.unlink(a, b);
}

/** An existing item that looks like the one being saved (same title or ~same content), or null. */
export async function findSimilarInformation(
  input: { title: string; content: string },
  excludeId?: number,
): Promise<InformationItem | null> {
  const repos = await getRepositories();
  return findMostSimilar(input, await repos.information.findAll(), excludeId);
}

/** Number of items per mastery level (0…5). */
export async function getMasteryCounts(): Promise<number[]> {
  const repos = await getRepositories();
  return repos.information.masteryCounts();
}

export async function getInformation(id: number): Promise<InformationItem | null> {
  const repos = await getRepositories();
  const item = await repos.information.findById(id);
  return item ? (await attachTags([item]))[0] : null;
}

export async function getReviewHistory(id: number): Promise<ReviewHistoryEntry[]> {
  const repos = await getRepositories();
  return repos.reviewHistory.findByInformationId(id);
}

export function sortByNextReminder(items: InformationItem[], now: number): InformationItem[] {
  const next = new Map<number, number | null>();
  for (const item of items) {
    next.set(item.id, item.reminder ? getNextReminderAt(item.reminder, now) : null);
  }
  return [...items].sort((a, b) => {
    const na = next.get(a.id) ?? null;
    const nb = next.get(b.id) ?? null;
    if (na === null && nb === null) {
      return b.createdAt - a.createdAt;
    }
    if (na === null) {
      return 1;
    }
    if (nb === null) {
      return -1;
    }
    return na - nb;
  });
}

export async function listInformation(
  query: InformationQuery,
  now: number = Date.now(),
): Promise<InformationItem[]> {
  const repos = await getRepositories();
  let items = await attachTags(
    await repos.information.findAll({
      search: query.search,
      categoryId: query.categoryId,
      tagId: query.tagId,
      collectionId: query.collectionId,
      status: query.status,
      sort: query.sort,
    }),
  );
  if (query.status === 'due') {
    items = items.filter(item => item.reminder !== null && isDueToday(item.reminder, now));
  }
  return query.sort === 'nextReminder' ? sortByNextReminder(items, now) : items;
}
