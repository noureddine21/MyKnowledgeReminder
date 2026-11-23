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
import { getNextReminderAt, initialSpacedSchedule } from './reviewSchedule';

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
        isActive: true,
        spacedStep: schedule.step,
        spacedBaseAt: createdAt,
      };
    }
  }
  return {
    scheduledAt: input.scheduledAt,
    frequency: input.frequency === 'spaced' ? 'once' : input.frequency,
    isActive: true,
    spacedStep: 0,
    spacedBaseAt: null,
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

  const id = await inTransaction(async tx => {
    let itemId: number;
    if (existing) {
      itemId = existing.id;
      await tx.information.update(itemId, input, now);
    } else {
      itemId = await tx.information.insert(input, now);
    }

    if (reminderInput.enabled) {
      const data: ReminderData =
        unchanged && existing?.reminder
          ? {
              scheduledAt: existing.reminder.scheduledAt,
              frequency: existing.reminder.frequency,
              isActive: true,
              spacedStep: existing.reminder.spacedStep,
              spacedBaseAt: existing.reminder.spacedBaseAt,
            }
          : buildReminderData(reminderInput, input.createdAt, settings.reviewIntervals, now);
      await tx.reminders.upsert(itemId, data, now);
    } else if (existing?.reminder) {
      // Keep the configuration so the user can turn it back on later.
      await tx.reminders.setActive(existing.reminder.id, false, now);
    }
    return itemId;
  });

  const warning = await syncItemNotification(id, now, { clearSnooze: true });
  return { id, warning };
}

export async function deleteInformation(id: number): Promise<void> {
  await cancelNotification(notificationIdFor(id));
  await cancelNotification(snoozeNotificationIdFor(id));
  const repos = await getRepositories();
  await repos.information.delete(id);
}

export async function getInformation(id: number): Promise<InformationItem | null> {
  const repos = await getRepositories();
  return repos.information.findById(id);
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
  const items = await repos.information.findAll({
    search: query.search,
    categoryId: query.categoryId,
    sort: query.sort,
  });
  return query.sort === 'nextReminder' ? sortByNextReminder(items, now) : items;
}
