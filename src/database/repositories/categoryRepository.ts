import type { Category } from '../../models';
import { AppError, ValidationError, withDbError } from '../../utils/errors';
import { mapCategory } from '../mappers';
import type { SqlExecutor } from '../types';

export interface CategoryWithCount extends Category {
  itemCount: number;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

export class CategoryRepository {
  constructor(private readonly db: SqlExecutor) {}

  findAll(): Promise<Category[]> {
    return withDbError('load categories', async () => {
      const result = await this.db.execute(
        'SELECT * FROM categories ORDER BY is_default DESC, name COLLATE NOCASE ASC',
      );
      return result.rows.map(row => mapCategory(row));
    });
  }

  findAllWithCounts(): Promise<CategoryWithCount[]> {
    return withDbError('load categories', async () => {
      const result = await this.db.execute(
        `SELECT c.*, COUNT(i.id) AS item_count
         FROM categories c
         LEFT JOIN information i ON i.category_id = c.id
         GROUP BY c.id
         ORDER BY c.is_default DESC, c.name COLLATE NOCASE ASC`,
      );
      return result.rows.map(row => ({ ...mapCategory(row), itemCount: Number(row.item_count) }));
    });
  }

  findById(id: number): Promise<Category | null> {
    return withDbError('load the category', async () => {
      const result = await this.db.execute('SELECT * FROM categories WHERE id = ?', [id]);
      return result.rows[0] ? mapCategory(result.rows[0]) : null;
    });
  }

  findByName(name: string): Promise<Category | null> {
    return withDbError('load the category', async () => {
      const result = await this.db.execute('SELECT * FROM categories WHERE name = ? COLLATE NOCASE', [
        name.trim(),
      ]);
      return result.rows[0] ? mapCategory(result.rows[0]) : null;
    });
  }

  async create(name: string, color: string, icon: string, now: number): Promise<number> {
    try {
      const result = await this.db.execute(
        'INSERT INTO categories (name, color, icon, is_default, created_at) VALUES (?, ?, ?, 0, ?)',
        [name.trim(), color, icon, now],
      );
      if (result.insertId === undefined) {
        throw new AppError('DATABASE', 'Could not create the category.');
      }
      return result.insertId;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ValidationError({ name: 'A category with this name already exists.' });
      }
      return withDbError('create the category', () => Promise.reject(error));
    }
  }

  async update(id: number, name: string, color: string, icon: string): Promise<void> {
    try {
      await this.db.execute('UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?', [
        name.trim(),
        color,
        icon,
        id,
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ValidationError({ name: 'A category with this name already exists.' });
      }
      return withDbError('update the category', () => Promise.reject(error));
    }
  }

  /** Moves all items of a category to another one (or to "no category" when null). */
  reassignItems(fromId: number, toId: number | null): Promise<void> {
    return withDbError('move items to another category', async () => {
      await this.db.execute('UPDATE information SET category_id = ? WHERE category_id = ?', [
        toId,
        fromId,
      ]);
    });
  }

  delete(id: number): Promise<void> {
    return withDbError('delete the category', async () => {
      await this.db.execute('DELETE FROM categories WHERE id = ? AND is_default = 0', [id]);
    });
  }
}
