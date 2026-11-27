import type { InformationInput, InformationItem, SortOption } from '../../models';
import { AppError, withDbError } from '../../utils/errors';
import { mapInformationItem } from '../mappers';
import type { SqlExecutor, SqlParam } from '../types';

const SELECT_ITEMS = `
  SELECT
    i.*,
    c.id AS c_id, c.name AS c_name, c.color AS c_color, c.icon AS c_icon,
    c.is_default AS c_is_default, c.created_at AS c_created_at,
    r.id AS r_id, r.information_id AS r_information_id, r.scheduled_at AS r_scheduled_at,
    r.frequency AS r_frequency, r.repeat_interval AS r_repeat_interval, r.is_active AS r_is_active, r.notification_id AS r_notification_id,
    r.spaced_step AS r_spaced_step, r.spaced_base_at AS r_spaced_base_at,
    r.last_reviewed_at AS r_last_reviewed_at, r.created_at AS r_created_at, r.updated_at AS r_updated_at
  FROM information i
  LEFT JOIN categories c ON c.id = i.category_id
  LEFT JOIN reminders r ON r.information_id = i.id`;

/** Escapes LIKE wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, ch => `\\${ch}`);
}

export interface InformationFilter {
  search?: string;
  categoryId?: number | null;
  tagId?: number | null;
  /** SQL-level sort; "nextReminder" is applied by the service layer. */
  sort?: SortOption;
  limit?: number;
}

export class InformationRepository {
  constructor(private readonly db: SqlExecutor) {}

  findAll(filter: InformationFilter = {}): Promise<InformationItem[]> {
    return withDbError('load your information', async () => {
      const where: string[] = [];
      const params: SqlParam[] = [];

      const search = filter.search?.trim();
      if (search) {
        const pattern = `%${escapeLike(search)}%`;
        where.push(
          "(i.title LIKE ? ESCAPE '\\' OR i.content LIKE ? ESCAPE '\\' OR IFNULL(i.source, '') LIKE ? ESCAPE '\\')",
        );
        params.push(pattern, pattern, pattern);
      }
      if (typeof filter.categoryId === 'number') {
        where.push('i.category_id = ?');
        params.push(filter.categoryId);
      }
      if (typeof filter.tagId === 'number') {
        where.push('i.id IN (SELECT information_id FROM information_tags WHERE tag_id = ?)');
        params.push(filter.tagId);
      }

      const order =
        filter.sort === 'createdAsc' ? 'i.created_at ASC, i.id ASC' : 'i.created_at DESC, i.id DESC';
      let sql = `${SELECT_ITEMS}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order}`;
      if (filter.limit) {
        sql += ' LIMIT ?';
        params.push(filter.limit);
      }
      const result = await this.db.execute(sql, params);
      return result.rows.map(mapInformationItem);
    });
  }

  findById(id: number): Promise<InformationItem | null> {
    return withDbError('load the information', async () => {
      const result = await this.db.execute(`${SELECT_ITEMS} WHERE i.id = ?`, [id]);
      return result.rows[0] ? mapInformationItem(result.rows[0]) : null;
    });
  }

  /** Items that have an active reminder (used for Review Today and upcoming lists). */
  findWithActiveReminder(): Promise<InformationItem[]> {
    return withDbError('load reminders', async () => {
      const result = await this.db.execute(
        `${SELECT_ITEMS} WHERE r.is_active = 1 ORDER BY r.scheduled_at ASC`,
      );
      return result.rows.map(mapInformationItem);
    });
  }

  count(): Promise<number> {
    return withDbError('count your information', async () => {
      const result = await this.db.execute('SELECT COUNT(*) AS total FROM information');
      return Number(result.rows[0]?.total ?? 0);
    });
  }

  insert(input: InformationInput, now: number): Promise<number> {
    return withDbError('save the information', async () => {
      const result = await this.db.execute(
        `INSERT INTO information (title, content, category_id, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.title.trim(),
          input.content.trim(),
          input.categoryId,
          input.source?.trim() || null,
          input.createdAt,
          now,
        ],
      );
      if (result.insertId === undefined) {
        throw new AppError('DATABASE', 'Could not save the information.');
      }
      return result.insertId;
    });
  }

  update(id: number, input: InformationInput, now: number): Promise<void> {
    return withDbError('update the information', async () => {
      await this.db.execute(
        `UPDATE information
         SET title = ?, content = ?, category_id = ?, source = ?, created_at = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.title.trim(),
          input.content.trim(),
          input.categoryId,
          input.source?.trim() || null,
          input.createdAt,
          now,
          id,
        ],
      );
    });
  }

  /** Reminders and review history are removed by ON DELETE CASCADE. */
  delete(id: number): Promise<void> {
    return withDbError('delete the information', async () => {
      await this.db.execute('DELETE FROM information WHERE id = ?', [id]);
    });
  }
}
