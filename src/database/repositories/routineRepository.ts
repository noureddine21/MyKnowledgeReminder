import type { Routine, RoutineInput } from '../../models';
import { withDbError } from '../../utils/errors';
import type { SqlExecutor, SqlRow } from '../types';

function parseDays(raw: unknown): number[] {
  try {
    const days = JSON.parse(String(raw));
    return Array.isArray(days) ? days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  } catch {
    return [];
  }
}

function mapRoutine(row: SqlRow): Routine {
  return {
    id: Number(row.id),
    title: String(row.title),
    durationMin: Number(row.duration_min),
    fixedStartMin: row.fixed_start_min === null || row.fixed_start_min === undefined ? null : Number(row.fixed_start_min),
    important: Number(row.important) === 1,
    days: parseDays(row.days),
    isActive: Number(row.is_active) === 1,
    alarm: Number(row.alarm) === 1,
    createdAt: Number(row.created_at),
  };
}

export class RoutineRepository {
  constructor(private readonly db: SqlExecutor) {}

  findAll(): Promise<Routine[]> {
    return withDbError('load routines', async () => {
      const result = await this.db.execute('SELECT * FROM routines ORDER BY created_at ASC');
      return result.rows.map(mapRoutine);
    });
  }

  insert(input: RoutineInput, now: number): Promise<number> {
    return withDbError('save the routine', async () => {
      const result = await this.db.execute(
        `INSERT INTO routines (title, duration_min, fixed_start_min, important, days, is_active, alarm, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.title,
          input.durationMin,
          input.fixedStartMin,
          input.important ? 1 : 0,
          JSON.stringify(input.days),
          input.isActive ? 1 : 0,
          input.alarm ? 1 : 0,
          now,
        ],
      );
      return Number(result.insertId);
    });
  }

  update(id: number, input: RoutineInput): Promise<void> {
    return withDbError('save the routine', async () => {
      await this.db.execute(
        `UPDATE routines SET title = ?, duration_min = ?, fixed_start_min = ?, important = ?, days = ?, is_active = ?,
           alarm = ?
         WHERE id = ?`,
        [
          input.title,
          input.durationMin,
          input.fixedStartMin,
          input.important ? 1 : 0,
          JSON.stringify(input.days),
          input.isActive ? 1 : 0,
          input.alarm ? 1 : 0,
          id,
        ],
      );
    });
  }

  delete(id: number): Promise<void> {
    return withDbError('delete the routine', async () => {
      await this.db.execute('DELETE FROM routines WHERE id = ?', [id]);
    });
  }
}
