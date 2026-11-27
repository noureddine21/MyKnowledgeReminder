/**
 * Mastery of an item, from 0 (new) to 5 (mastered), moved by each answer:
 * hard −1 (never back to "new"), good +1, easy +2.
 */
import type { MasteryLevel } from '../models';

export type Grade = 'hard' | 'good' | 'easy';

export const MAX_MASTERY = 5;
/** From this level an item counts as "learned" (collections progress). */
export const LEARNED_MASTERY = 3;

export function nextMastery(current: number, grade: Grade): number {
  const value = Math.max(0, Math.min(MAX_MASTERY, Math.round(current) || 0));
  if (grade === 'hard') {
    return Math.max(1, value - 1);
  }
  return Math.min(MAX_MASTERY, value + (grade === 'easy' ? 2 : 1));
}

export function masteryLevel(mastery: number): MasteryLevel {
  if (mastery <= 0) {
    return 'new';
  }
  if (mastery <= 2) {
    return 'learning';
  }
  return mastery >= MAX_MASTERY ? 'mastered' : 'known';
}

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  new: 'New',
  learning: 'Learning',
  known: 'Known',
  mastered: 'Mastered',
};

export const MASTERY_ICONS: Record<MasteryLevel, string> = {
  new: 'sprout-outline',
  learning: 'progress-clock',
  known: 'check-circle-outline',
  mastered: 'trophy-outline',
};
