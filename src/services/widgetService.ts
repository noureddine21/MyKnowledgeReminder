/**
 * Home-screen widget "My day": the JS side computes a small snapshot (next tasks,
 * items to review) and hands it to the native widget, which only displays it.
 * Refreshed whenever plans or reminders change, and at app start.
 */
import { getRepositories } from '../database/repositories';
import type { DayPlan } from '../models';
import { isNativeAvailable, updateWidget } from '../native/mkrNative';
import { formatTime } from '../utils/date';
import { logError } from '../utils/errors';
import { dateKey } from './dayPlanner';
import { getDueAt, isDueToday } from './reviewSchedule';

export interface WidgetSnapshot {
  title: string;
  subtitle: string;
  lines: string[];
  /** Small badge, e.g. "3 to review"; empty to hide. */
  badge: string;
}

const MAX_LINES = 5;

export function buildWidgetSnapshot(plan: DayPlan | null, dueCount: number, now: number): WidgetSnapshot {
  const badge = dueCount > 0 ? `${dueCount} to review` : '';
  if (!plan || plan.tasks.length === 0) {
    return {
      title: 'My day',
      subtitle: dueCount > 0 ? 'Tap to review and plan your day' : 'Tap to plan your day',
      lines: [],
      badge,
    };
  }
  const done = plan.tasks.filter(t => t.isDone).length;
  const upcoming = plan.tasks
    .filter(t => !t.isDone && t.startAt !== null && t.endAt !== null && t.endAt > now)
    .sort((a, b) => a.startAt! - b.startAt!);
  const lines = upcoming.slice(0, MAX_LINES).map(t => {
    const current = t.startAt! <= now;
    return `${current ? '▶ ' : ''}${formatTime(t.startAt!)}  ${t.important ? '⭐ ' : ''}${t.title}`;
  });
  if (lines.length === 0) {
    lines.push(done === plan.tasks.length ? 'Everything is done today 🎉' : 'No more tasks planned today');
  }
  return {
    title: 'My day',
    subtitle: `${done}/${plan.tasks.length} tasks done`,
    lines,
    badge,
  };
}

/** Recomputes and pushes the widget snapshot. Never throws; no-op outside Android. */
export async function refreshWidget(now: number = Date.now()): Promise<void> {
  if (!isNativeAvailable()) {
    return;
  }
  try {
    const repos = await getRepositories();
    const plan = await repos.plans.findByDate(dateKey(now));
    const items = await repos.information.findWithActiveReminder();
    const due = items.filter(i => i.reminder && isDueToday(i.reminder, now) && getDueAt(i.reminder, now) !== null).length;
    await updateWidget(buildWidgetSnapshot(plan, due, now));
  } catch (error) {
    logError('widget:refresh', error);
  }
}
