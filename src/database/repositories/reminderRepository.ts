import type { Reminder, ReminderFrequency } from '../../models';
import { withDbError } from '../../utils/errors';
import { mapReminder } from '../mappers';
import type { SqlExecutor } from '../types';

export interface ReminderData {
  scheduledAt: number;
  frequency: ReminderFrequency;
  repeatInterval: number;
  isActive: boolean;
  spacedStep: number;
  spacedBaseAt: number | null;
}

export class ReminderRepository {
  constructor(private readonly db: SqlExecutor) {}

  findByInformationId(informationId: number): Promise<Reminder | null> {
    return withDbError('load the reminder', async () => {
      const result = await this.db.execute('SELECT * FROM reminders WHERE information_id = ?', [
        informationId,
      ]);
      return result.rows[0] ? mapReminder(result.rows[0]) : null;
    });
  }

  findAllActive(): Promise<Reminder[]> {
    return withDbError('load reminders', async () => {
      const result = await this.db.execute(
        'SELECT * FROM reminders WHERE is_active = 1 ORDER BY scheduled_at ASC',
      );
      return result.rows.map(row => mapReminder(row));
    });
  }

  findAll(): Promise<Reminder[]> {
    return withDbError('load reminders', async () => {
      const result = await this.db.execute('SELECT * FROM reminders');
      return result.rows.map(row => mapReminder(row));
    });
  }

  /** One reminder per information item: inserts or replaces its configuration. */
  upsert(informationId: number, data: ReminderData, now: number): Promise<void> {
    return withDbError('save the reminder', async () => {
      await this.db.execute(
        `INSERT INTO reminders
           (information_id, scheduled_at, frequency, repeat_interval, is_active, spaced_step, spaced_base_at,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(information_id) DO UPDATE SET
           scheduled_at = excluded.scheduled_at,
           frequency = excluded.frequency,
           repeat_interval = excluded.repeat_interval,
           is_active = excluded.is_active,
           spaced_step = excluded.spaced_step,
           spaced_base_at = excluded.spaced_base_at,
           updated_at = excluded.updated_at`,
        [
          informationId,
          data.scheduledAt,
          data.frequency,
          data.repeatInterval,
          data.isActive ? 1 : 0,
          data.spacedStep,
          data.spacedBaseAt,
          now,
          now,
        ],
      );
    });
  }

  updateSchedule(
    id: number,
    fields: { scheduledAt: number; isActive: boolean; spacedStep: number; lastReviewedAt: number | null },
    now: number,
  ): Promise<void> {
    return withDbError('update the reminder', async () => {
      await this.db.execute(
        `UPDATE reminders
         SET scheduled_at = ?, is_active = ?, spaced_step = ?, last_reviewed_at = ?, updated_at = ?
         WHERE id = ?`,
        [fields.scheduledAt, fields.isActive ? 1 : 0, fields.spacedStep, fields.lastReviewedAt, now, id],
      );
    });
  }

  setActive(id: number, isActive: boolean, now: number): Promise<void> {
    return withDbError('update the reminder', async () => {
      await this.db.execute('UPDATE reminders SET is_active = ?, updated_at = ? WHERE id = ?', [
        isActive ? 1 : 0,
        now,
        id,
      ]);
    });
  }

  setNotificationId(id: number, notificationId: string | null): Promise<void> {
    return withDbError('update the reminder', async () => {
      await this.db.execute('UPDATE reminders SET notification_id = ? WHERE id = ?', [
        notificationId,
        id,
      ]);
    });
  }

  deleteByInformationId(informationId: number): Promise<void> {
    return withDbError('remove the reminder', async () => {
      await this.db.execute('DELETE FROM reminders WHERE information_id = ?', [informationId]);
    });
  }
}
