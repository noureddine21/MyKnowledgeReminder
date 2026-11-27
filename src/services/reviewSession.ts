/**
 * Timed review session ("5 minutes"): the most urgent items first (due today),
 * then the least known ones, then the ones not seen for the longest time.
 */
import type { InformationItem } from '../models';

export const SESSION_MINUTES = [5, 10, 15];
export const MAX_SESSION_ITEMS = 60;

export function buildSessionItems(due: InformationItem[], all: InformationItem[], max = MAX_SESSION_ITEMS): InformationItem[] {
  const seen = new Set(due.map(i => i.id));
  const rest = all
    .filter(i => !seen.has(i.id))
    .sort(
      (a, b) =>
        a.mastery - b.mastery ||
        (a.reminder?.lastReviewedAt ?? 0) - (b.reminder?.lastReviewedAt ?? 0) ||
        a.createdAt - b.createdAt,
    );
  return [...due, ...rest].slice(0, max);
}

/** "4:05" */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
