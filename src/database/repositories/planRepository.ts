import type { DayPlan, DayWindow, PlanTask } from '../../models';
import { withDbError } from '../../utils/errors';
import { mapPlanTask } from '../mappers';
import type { SqlExecutor } from '../types';

export interface PlanTaskData {
  title: string;
  durationMin: number;
  fixedStartMin: number | null;
  important: boolean;
  position: number;
  startAt: number | null;
  endAt: number | null;
  isDone?: boolean;
  doneAt?: number | null;
}

export class PlanRepository {
  constructor(private readonly db: SqlExecutor) {}

  findByDate(planDate: string): Promise<DayPlan | null> {
    return withDbError('load the day plan', async () => {
      const plan = await this.db.execute('SELECT * FROM day_plans WHERE plan_date = ?', [planDate]);
      const row = plan.rows[0];
      if (!row) {
        return null;
      }
      const tasks = await this.db.execute(
        'SELECT * FROM plan_tasks WHERE plan_date = ? ORDER BY position ASC',
        [planDate],
      );
      const text = (v: unknown) => (v === null || v === undefined ? null : String(v));
      const dayStart = text(row.day_start);
      const dayEnd = text(row.day_end);
      return {
        planDate,
        rawInput: String(row.raw_input),
        updatedAt: Number(row.updated_at),
        tasks: tasks.rows.map(mapPlanTask),
        window:
          dayStart && dayEnd
            ? { dayStart, dayEnd, workStart: text(row.work_start), workEnd: text(row.work_end) }
            : null,
      };
    });
  }

  findTask(id: number): Promise<PlanTask | null> {
    return withDbError('load the task', async () => {
      const result = await this.db.execute('SELECT * FROM plan_tasks WHERE id = ?', [id]);
      return result.rows[0] ? mapPlanTask(result.rows[0]) : null;
    });
  }

  /** Creates or replaces the plan of a day with the given tasks. */
  replace(
    planDate: string,
    rawInput: string,
    tasks: PlanTaskData[],
    now: number,
    window: DayWindow,
  ): Promise<void> {
    return withDbError('save the day plan', async () => {
      await this.db.execute(
        `INSERT INTO day_plans
           (plan_date, raw_input, day_start, day_end, work_start, work_end, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(plan_date) DO UPDATE SET
           raw_input = excluded.raw_input,
           day_start = excluded.day_start,
           day_end = excluded.day_end,
           work_start = excluded.work_start,
           work_end = excluded.work_end,
           updated_at = excluded.updated_at`,
        [planDate, rawInput, window.dayStart, window.dayEnd, window.workStart, window.workEnd, now, now],
      );
      await this.db.execute('DELETE FROM plan_tasks WHERE plan_date = ?', [planDate]);
      for (const task of tasks) {
        await this.db.execute(
          `INSERT INTO plan_tasks
             (plan_date, title, duration_min, fixed_start_min, important, position, start_at, end_at, is_done, done_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            planDate,
            task.title,
            task.durationMin,
            task.fixedStartMin,
            task.important ? 1 : 0,
            task.position,
            task.startAt,
            task.endAt,
            task.isDone ? 1 : 0,
            task.doneAt ?? null,
          ],
        );
      }
    });
  }

  updateSlot(id: number, startAt: number | null, endAt: number | null): Promise<void> {
    return withDbError('update the task', async () => {
      await this.db.execute('UPDATE plan_tasks SET start_at = ?, end_at = ? WHERE id = ?', [startAt, endAt, id]);
    });
  }

  setDone(id: number, done: boolean, now: number): Promise<void> {
    return withDbError('update the task', async () => {
      await this.db.execute('UPDATE plan_tasks SET is_done = ?, done_at = ? WHERE id = ?', [
        done ? 1 : 0,
        done ? now : null,
        id,
      ]);
    });
  }

  touch(planDate: string, now: number): Promise<void> {
    return withDbError('update the day plan', async () => {
      await this.db.execute('UPDATE day_plans SET updated_at = ? WHERE plan_date = ?', [now, planDate]);
    });
  }

  /** Keeps history small: removes plans older than `planDate`. */
  deleteBefore(planDate: string): Promise<void> {
    return withDbError('clean old plans', async () => {
      await this.db.execute('DELETE FROM day_plans WHERE plan_date < ?', [planDate]);
    });
  }
}
