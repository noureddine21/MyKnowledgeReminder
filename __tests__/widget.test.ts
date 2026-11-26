import type { DayPlan, PlanTask } from '../src/models';
import { buildWidgetSnapshot } from '../src/services/widgetService';

const at = (h: number, m = 0) => new Date(2026, 10, 26, h, m).getTime();
const task = (id: number, title: string, start: number, minutes: number, extra: Partial<PlanTask> = {}): PlanTask => ({
  id,
  planDate: '2026-11-26',
  title,
  durationMin: minutes,
  fixedStartMin: null,
  important: false,
  position: id,
  startAt: start,
  endAt: start + minutes * 60_000,
  isDone: false,
  doneAt: null,
  ...extra,
});
const plan = (tasks: PlanTask[]): DayPlan => ({ planDate: '2026-11-26', rawInput: '', tasks, updatedAt: 0, window: null });

describe('home-screen widget snapshot', () => {
  it('invites to plan when there is no plan', () => {
    expect(buildWidgetSnapshot(null, 2, at(8))).toEqual({
      title: 'My day',
      subtitle: 'Tap to review and plan your day',
      lines: [],
      badge: '2 to review',
    });
  });

  it('lists the current and next tasks with progress', () => {
    const snapshot = buildWidgetSnapshot(
      plan([
        task(1, 'Emails', at(8), 30, { isDone: true }),
        task(2, 'Report', at(9), 120, { important: true }),
        task(3, 'Gym', at(17), 60),
        task(4, 'Old', at(7), 15),
      ]),
      0,
      at(9, 30),
    );
    expect(snapshot).toEqual({
      title: 'My day',
      subtitle: '1/4 tasks done',
      lines: ['▶ 09:00  ⭐ Report', '17:00  Gym'],
      badge: '',
    });
  });

  it('celebrates when everything is done', () => {
    expect(buildWidgetSnapshot(plan([task(1, 'A', at(8), 30, { isDone: true })]), 0, at(9)).lines).toEqual([
      'Everything is done today 🎉',
    ]);
  });
});
