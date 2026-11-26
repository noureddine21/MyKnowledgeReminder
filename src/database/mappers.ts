import type {
  Category,
  Information,
  InformationItem,
  Reminder,
  ReminderFrequency,
  ReviewHistoryEntry,
  ReviewStatus,
  PlanTask,
} from '../models';
import type { SqlRow } from './types';

const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const bool = (v: unknown): boolean => Number(v) === 1;

export function mapCategory(row: SqlRow, prefix = ''): Category {
  return {
    id: num(row[`${prefix}id`]),
    name: str(row[`${prefix}name`]),
    color: str(row[`${prefix}color`]),
    icon: str(row[`${prefix}icon`]) || 'tag-outline',
    isDefault: bool(row[`${prefix}is_default`]),
    createdAt: num(row[`${prefix}created_at`]),
  };
}

export function mapInformation(row: SqlRow): Information {
  return {
    id: num(row.id),
    title: str(row.title),
    content: str(row.content),
    categoryId: numOrNull(row.category_id),
    source: strOrNull(row.source),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  };
}

export function mapReminder(row: SqlRow, prefix = ''): Reminder {
  return {
    id: num(row[`${prefix}id`]),
    informationId: num(row[`${prefix}information_id`]),
    scheduledAt: num(row[`${prefix}scheduled_at`]),
    frequency: str(row[`${prefix}frequency`]) as ReminderFrequency,
    repeatInterval: num(row[`${prefix}repeat_interval`] ?? 1) || 1,
    isActive: bool(row[`${prefix}is_active`]),
    notificationId: strOrNull(row[`${prefix}notification_id`]),
    spacedStep: num(row[`${prefix}spaced_step`] ?? 0),
    spacedBaseAt: numOrNull(row[`${prefix}spaced_base_at`]),
    lastReviewedAt: numOrNull(row[`${prefix}last_reviewed_at`]),
    createdAt: num(row[`${prefix}created_at`]),
    updatedAt: num(row[`${prefix}updated_at`]),
  };
}

/** Maps a row from the joined information/category/reminder query. */
export function mapInformationItem(row: SqlRow): InformationItem {
  return {
    ...mapInformation(row),
    category: row.c_id === null || row.c_id === undefined ? null : mapCategory(row, 'c_'),
    reminder: row.r_id === null || row.r_id === undefined ? null : mapReminder(row, 'r_'),
  };
}

export function mapReviewHistory(row: SqlRow): ReviewHistoryEntry {
  return {
    id: num(row.id),
    informationId: num(row.information_id),
    reviewedAt: num(row.reviewed_at),
    status: str(row.status) as ReviewStatus,
  };
}

export function mapPlanTask(row: SqlRow): PlanTask {
  return {
    id: num(row.id),
    planDate: str(row.plan_date),
    title: str(row.title),
    durationMin: num(row.duration_min),
    fixedStartMin: numOrNull(row.fixed_start_min),
    important: bool(row.important),
    position: num(row.position),
    startAt: numOrNull(row.start_at),
    endAt: numOrNull(row.end_at),
    isDone: bool(row.is_done),
    doneAt: numOrNull(row.done_at),
  };
}
