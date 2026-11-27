import type { Collection, CollectionWithProgress } from '../../models';
import { ValidationError, withDbError } from '../../utils/errors';
import type { SqlExecutor, SqlRow } from '../types';

const mapCollection = (row: SqlRow): Collection => ({
  id: Number(row.id),
  name: String(row.name),
  color: String(row.color),
  createdAt: Number(row.created_at),
});

export class CollectionRepository {
  constructor(private readonly db: SqlExecutor) {}

  findAllWithProgress(): Promise<CollectionWithProgress[]> {
    return withDbError('load collections', async () => {
      const result = await this.db.execute(
        `SELECT c.*, COUNT(i.id) AS item_count, IFNULL(SUM(CASE WHEN i.mastery >= 3 THEN 1 ELSE 0 END), 0) AS learned_count
         FROM collections c LEFT JOIN information i ON i.collection_id = c.id
         GROUP BY c.id ORDER BY c.name COLLATE NOCASE ASC`,
      );
      return result.rows.map(row => ({
        ...mapCollection(row),
        itemCount: Number(row.item_count),
        learnedCount: Number(row.learned_count),
      }));
    });
  }

  findById(id: number): Promise<Collection | null> {
    return withDbError('load the collection', async () => {
      const result = await this.db.execute('SELECT * FROM collections WHERE id = ?', [id]);
      return result.rows[0] ? mapCollection(result.rows[0]) : null;
    });
  }

  private async assertUnique(name: string, exceptId: number | null): Promise<void> {
    const existing = await this.db.execute('SELECT id FROM collections WHERE name = ? COLLATE NOCASE AND id <> ?', [
      name,
      exceptId ?? -1,
    ]);
    if (existing.rows[0]) {
      throw new ValidationError({ name: 'This collection already exists.' });
    }
  }

  create(name: string, color: string, now: number): Promise<number> {
    return withDbError('save the collection', async () => {
      await this.assertUnique(name, null);
      const result = await this.db.execute('INSERT INTO collections (name, color, created_at) VALUES (?, ?, ?)', [
        name,
        color,
        now,
      ]);
      return Number(result.insertId);
    });
  }

  update(id: number, name: string, color: string): Promise<void> {
    return withDbError('save the collection', async () => {
      await this.assertUnique(name, id);
      await this.db.execute('UPDATE collections SET name = ?, color = ? WHERE id = ?', [name, color, id]);
    });
  }

  /** Items keep their content; they simply leave the collection. */
  delete(id: number): Promise<void> {
    return withDbError('delete the collection', async () => {
      await this.db.execute('UPDATE information SET collection_id = NULL, collection_position = NULL WHERE collection_id = ?', [id]);
      await this.db.execute('DELETE FROM collections WHERE id = ?', [id]);
    });
  }
}
