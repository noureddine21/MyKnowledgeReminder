import type { Tag, TagWithCount } from '../../models';
import { ValidationError, withDbError } from '../../utils/errors';
import type { SqlExecutor, SqlRow } from '../types';

const mapTag = (row: SqlRow): Tag => ({ id: Number(row.id), name: String(row.name), color: String(row.color) });

export class TagRepository {
  constructor(private readonly db: SqlExecutor) {}

  findAllWithCounts(): Promise<TagWithCount[]> {
    return withDbError('load tags', async () => {
      const result = await this.db.execute(
        `SELECT t.*, COUNT(it.information_id) AS item_count
         FROM tags t LEFT JOIN information_tags it ON it.tag_id = t.id
         GROUP BY t.id ORDER BY t.name COLLATE NOCASE ASC`,
      );
      return result.rows.map(row => ({ ...mapTag(row), itemCount: Number(row.item_count) }));
    });
  }

  create(name: string, color: string, now: number): Promise<number> {
    return withDbError('save the tag', async () => {
      const existing = await this.db.execute('SELECT id FROM tags WHERE name = ? COLLATE NOCASE', [name]);
      if (existing.rows[0]) {
        throw new ValidationError({ tag: 'This tag already exists.' });
      }
      const result = await this.db.execute('INSERT INTO tags (name, color, created_at) VALUES (?, ?, ?)', [name, color, now]);
      return Number(result.insertId);
    });
  }

  rename(id: number, name: string): Promise<void> {
    return withDbError('save the tag', async () => {
      const existing = await this.db.execute('SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND id <> ?', [name, id]);
      if (existing.rows[0]) {
        throw new ValidationError({ tag: 'This tag already exists.' });
      }
      await this.db.execute('UPDATE tags SET name = ? WHERE id = ?', [name, id]);
    });
  }

  delete(id: number): Promise<void> {
    return withDbError('delete the tag', async () => {
      await this.db.execute('DELETE FROM tags WHERE id = ?', [id]);
    });
  }

  /** Replaces the tags of one item. */
  setForItem(informationId: number, tagIds: number[]): Promise<void> {
    return withDbError('save the tags', async () => {
      await this.db.execute('DELETE FROM information_tags WHERE information_id = ?', [informationId]);
      for (const tagId of [...new Set(tagIds)]) {
        await this.db.execute('INSERT OR IGNORE INTO information_tags (information_id, tag_id) VALUES (?, ?)', [
          informationId,
          tagId,
        ]);
      }
    });
  }

  /** Tags of many items at once: informationId → tags (sorted by name). */
  findForItems(informationIds: number[]): Promise<Map<number, Tag[]>> {
    return withDbError('load tags', async () => {
      const map = new Map<number, Tag[]>();
      if (informationIds.length === 0) {
        return map;
      }
      const result = await this.db.execute(
        `SELECT it.information_id AS information_id, t.id AS id, t.name AS name, t.color AS color
         FROM information_tags it JOIN tags t ON t.id = it.tag_id
         ORDER BY t.name COLLATE NOCASE ASC`,
      );
      const wanted = new Set(informationIds);
      for (const row of result.rows) {
        const infoId = Number(row.information_id);
        if (wanted.has(infoId)) {
          map.set(infoId, [...(map.get(infoId) ?? []), mapTag(row)]);
        }
      }
      return map;
    });
  }
}
