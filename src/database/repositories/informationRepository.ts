import type { InformationInput, InformationItem, InformationStatus, SortOption } from '../../models';
import { AppError, withDbError } from '../../utils/errors';
import { mapInformationItem } from '../mappers';
import type { SqlExecutor, SqlParam } from '../types';

const SELECT_ITEMS = `
  SELECT
    i.*,
    c.id AS c_id, c.name AS c_name, c.color AS c_color, c.icon AS c_icon,
    c.is_default AS c_is_default, c.created_at AS c_created_at,
    r.id AS r_id, r.information_id AS r_information_id, r.scheduled_at AS r_scheduled_at,
    r.frequency AS r_frequency, r.repeat_interval AS r_repeat_interval, r.alarm AS r_alarm, r.is_active AS r_is_active, r.notification_id AS r_notification_id,
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
  collectionId?: number | null;
  /** 'due' is applied by the service layer (needs the schedule logic). */
  status?: InformationStatus;
  /** SQL-level sort; "nextReminder" is applied by the service layer. */
  sort?: SortOption;
  limit?: number;
}

const MASTERY_RANGES: Partial<Record<InformationStatus, [number, number]>> = {
  new: [0, 0],
  learning: [1, 2],
  known: [3, 4],
  mastered: [5, 5],
};

/** Columns written from the form (besides title/content/category/source/created_at). */
interface ExtraColumns {
  question: string | null;
  isFavorite: boolean;
  imagePath: string | null;
  audioPath: string | null;
  collectionId: number | null;
  collectionPosition: number | null;
}

function extras(input: InformationInput, collectionPosition: number | null): ExtraColumns {
  return {
    question: input.question?.trim() || null,
    isFavorite: input.isFavorite ?? false,
    imagePath: input.imagePath || null,
    audioPath: input.audioPath || null,
    collectionId: input.collectionId ?? null,
    collectionPosition: input.collectionId ? collectionPosition : null,
  };
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
          `(i.title LIKE ? ESCAPE '\\' OR i.content LIKE ? ESCAPE '\\' OR IFNULL(i.source, '') LIKE ? ESCAPE '\\'
            OR IFNULL(i.question, '') LIKE ? ESCAPE '\\')`,
        );
        params.push(pattern, pattern, pattern, pattern);
      }
      if (typeof filter.categoryId === 'number') {
        where.push('i.category_id = ?');
        params.push(filter.categoryId);
      }
      if (typeof filter.tagId === 'number') {
        where.push('i.id IN (SELECT information_id FROM information_tags WHERE tag_id = ?)');
        params.push(filter.tagId);
      }
      if (typeof filter.collectionId === 'number') {
        where.push('i.collection_id = ?');
        params.push(filter.collectionId);
      }
      if (filter.status === 'favorites') {
        where.push('i.is_favorite = 1');
      }
      const range = filter.status ? MASTERY_RANGES[filter.status] : undefined;
      if (range) {
        where.push('i.mastery BETWEEN ? AND ?');
        params.push(range[0], range[1]);
      }

      const byDate = filter.sort === 'createdAsc' ? 'i.created_at ASC, i.id ASC' : 'i.created_at DESC, i.id DESC';
      // A collection is read in its own order; otherwise favorites come first.
      const order =
        typeof filter.collectionId === 'number'
          ? `i.collection_position ASC, ${byDate}`
          : `i.is_favorite DESC, ${byDate}`;
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

  findByIds(ids: number[]): Promise<InformationItem[]> {
    return withDbError('load the information', async () => {
      if (ids.length === 0) {
        return [];
      }
      const result = await this.db.execute(
        `${SELECT_ITEMS} WHERE i.id IN (${ids.map(() => '?').join(', ')}) ORDER BY i.title COLLATE NOCASE ASC`,
        ids,
      );
      return result.rows.map(mapInformationItem);
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

  /** Number of items per mastery level (0…5). */
  masteryCounts(): Promise<number[]> {
    return withDbError('count your information', async () => {
      const result = await this.db.execute('SELECT mastery, COUNT(*) AS n FROM information GROUP BY mastery');
      const counts = [0, 0, 0, 0, 0, 0];
      for (const row of result.rows) {
        const level = Number(row.mastery);
        if (level >= 0 && level <= 5) {
          counts[level] = Number(row.n);
        }
      }
      return counts;
    });
  }

  /** Next free position at the end of a collection. */
  nextCollectionPosition(collectionId: number): Promise<number> {
    return withDbError('load the collection', async () => {
      const result = await this.db.execute(
        'SELECT IFNULL(MAX(collection_position), 0) + 1 AS next FROM information WHERE collection_id = ?',
        [collectionId],
      );
      return Number(result.rows[0]?.next ?? 1);
    });
  }

  insert(input: InformationInput, now: number, collectionPosition: number | null = null): Promise<number> {
    return withDbError('save the information', async () => {
      const x = extras(input, collectionPosition);
      const result = await this.db.execute(
        `INSERT INTO information (title, content, category_id, source, created_at, updated_at,
           question, is_favorite, image_path, audio_path, collection_id, collection_position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.title.trim(),
          input.content.trim(),
          input.categoryId,
          input.source?.trim() || null,
          input.createdAt,
          now,
          x.question,
          x.isFavorite ? 1 : 0,
          x.imagePath,
          x.audioPath,
          x.collectionId,
          x.collectionPosition,
        ],
      );
      if (result.insertId === undefined) {
        throw new AppError('DATABASE', 'Could not save the information.');
      }
      return result.insertId;
    });
  }

  update(id: number, input: InformationInput, now: number, collectionPosition: number | null = null): Promise<void> {
    return withDbError('update the information', async () => {
      const x = extras(input, collectionPosition);
      await this.db.execute(
        `UPDATE information
         SET title = ?, content = ?, category_id = ?, source = ?, created_at = ?, updated_at = ?,
             question = ?, is_favorite = ?, image_path = ?, audio_path = ?, collection_id = ?, collection_position = ?
         WHERE id = ?`,
        [
          input.title.trim(),
          input.content.trim(),
          input.categoryId,
          input.source?.trim() || null,
          input.createdAt,
          now,
          x.question,
          x.isFavorite ? 1 : 0,
          x.imagePath,
          x.audioPath,
          x.collectionId,
          x.collectionPosition,
          id,
        ],
      );
    });
  }

  setFavorite(id: number, favorite: boolean): Promise<void> {
    return withDbError('update the information', async () => {
      await this.db.execute('UPDATE information SET is_favorite = ? WHERE id = ?', [favorite ? 1 : 0, id]);
    });
  }

  setMastery(id: number, mastery: number): Promise<void> {
    return withDbError('update the information', async () => {
      const level = Math.max(0, Math.min(5, Math.round(mastery)));
      await this.db.execute('UPDATE information SET mastery = ? WHERE id = ?', [level, id]);
    });
  }

  setCollectionPosition(id: number, position: number): Promise<void> {
    return withDbError('update the collection', async () => {
      await this.db.execute('UPDATE information SET collection_position = ? WHERE id = ?', [position, id]);
    });
  }

  /** Ids of the items linked to `id` ("see also"), in both directions. */
  linkedIds(id: number): Promise<number[]> {
    return withDbError('load the links', async () => {
      const result = await this.db.execute(
        'SELECT b_id AS other FROM information_links WHERE a_id = ? UNION SELECT a_id FROM information_links WHERE b_id = ?',
        [id, id],
      );
      return result.rows.map(r => Number(r.other));
    });
  }

  link(a: number, b: number, now: number): Promise<void> {
    return withDbError('link the information', async () => {
      if (a === b) {
        return;
      }
      await this.db.execute('INSERT OR IGNORE INTO information_links (a_id, b_id, created_at) VALUES (?, ?, ?)', [
        Math.min(a, b),
        Math.max(a, b),
        now,
      ]);
    });
  }

  unlink(a: number, b: number): Promise<void> {
    return withDbError('unlink the information', async () => {
      await this.db.execute('DELETE FROM information_links WHERE a_id = ? AND b_id = ?', [Math.min(a, b), Math.max(a, b)]);
    });
  }

  /** Reminders, review history and links are removed by ON DELETE CASCADE. */
  delete(id: number): Promise<void> {
    return withDbError('delete the information', async () => {
      await this.db.execute('DELETE FROM information WHERE id = ?', [id]);
    });
  }
}
