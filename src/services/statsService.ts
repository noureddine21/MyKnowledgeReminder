/**
 * Statistics & streaks, computed from the review history and the day plans.
 */
import { getDatabase } from '../database/connection';
import { addDays, startOfDay } from '../utils/date';
import { dateKey } from './dayPlanner';

export interface DayCount {
  day: number;
  count: number;
}

export interface Stats {
  /** Consecutive days with at least one review, ending today (or yesterday if not yet today). */
  currentStreak: number;
  bestStreak: number;
  reviewedToday: boolean;
  /** Reviews per day for the last 7 days (oldest first). */
  lastWeek: DayCount[];
  reviewsThisWeek: number;
  totalReviews: number;
  totalItems: number;
  byCategory: { name: string; color: string; count: number }[];
  planner: { done: number; planned: number; daysPlanned: number };
}

/** Distinct local days (start-of-day timestamps) present in `timestamps`. */
export function distinctDays(timestamps: number[]): number[] {
  return [...new Set(timestamps.map(startOfDay))].sort((a, b) => a - b);
}

export function computeStreaks(days: number[], now: number): { current: number; best: number } {
  const set = new Set(days);
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of days) {
    run = previous !== null && startOfDay(addDays(previous, 1)) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  let current = 0;
  // Today does not break the streak until it is over.
  let cursor = set.has(startOfDay(now)) ? startOfDay(now) : startOfDay(addDays(now, -1));
  while (set.has(cursor)) {
    current++;
    cursor = startOfDay(addDays(cursor, -1));
  }
  return { current, best };
}

export async function getStats(now: number = Date.now()): Promise<Stats> {
  const db = await getDatabase();
  const reviews = await db.execute(
    "SELECT reviewed_at FROM review_history WHERE status = 'reviewed' ORDER BY reviewed_at ASC",
  );
  const times = reviews.rows.map(r => Number(r.reviewed_at));
  const days = distinctDays(times);
  const { current, best } = computeStreaks(days, now);

  const lastWeek: DayCount[] = [];
  for (let back = 6; back >= 0; back--) {
    const day = startOfDay(addDays(now, -back));
    const next = startOfDay(addDays(day, 1));
    lastWeek.push({ day, count: times.filter(t => t >= day && t < next).length });
  }

  const totalItems = Number((await db.execute('SELECT COUNT(*) AS n FROM information')).rows[0]?.n ?? 0);
  const categories = await db.execute(
    `SELECT c.name AS name, c.color AS color, COUNT(i.id) AS count
     FROM categories c JOIN information i ON i.category_id = c.id
     GROUP BY c.id ORDER BY count DESC`,
  );

  const weekKeys = Array.from({ length: 7 }, (_, i) => dateKey(addDays(now, -i)));
  const placeholders = weekKeys.map(() => '?').join(', ');
  const tasks = await db.execute(
    `SELECT COUNT(*) AS planned, SUM(is_done) AS done, COUNT(DISTINCT plan_date) AS days
     FROM plan_tasks WHERE plan_date IN (${placeholders})`,
    weekKeys,
  );
  const taskRow = tasks.rows[0] ?? {};

  return {
    currentStreak: current,
    bestStreak: best,
    reviewedToday: days.includes(startOfDay(now)),
    lastWeek,
    reviewsThisWeek: lastWeek.reduce((sum, d) => sum + d.count, 0),
    totalReviews: times.length,
    totalItems,
    byCategory: categories.rows.map(r => ({ name: String(r.name), color: String(r.color), count: Number(r.count) })),
    planner: {
      planned: Number(taskRow.planned ?? 0),
      done: Number(taskRow.done ?? 0),
      daysPlanned: Number(taskRow.days ?? 0),
    },
  };
}
