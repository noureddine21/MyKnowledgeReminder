import type { ReviewHistoryEntry, ReviewStatus } from '../../models';
import { withDbError } from '../../utils/errors';
import { mapReviewHistory } from '../mappers';
import type { SqlExecutor } from '../types';

export class ReviewHistoryRepository {
  constructor(private readonly db: SqlExecutor) {}

  add(informationId: number, status: ReviewStatus, at: number): Promise<void> {
    return withDbError('save the review', async () => {
      await this.db.execute(
        'INSERT INTO review_history (information_id, reviewed_at, status) VALUES (?, ?, ?)',
        [informationId, at, status],
      );
    });
  }

  findByInformationId(informationId: number, limit = 20): Promise<ReviewHistoryEntry[]> {
    return withDbError('load the review history', async () => {
      const result = await this.db.execute(
        `SELECT * FROM review_history WHERE information_id = ?
         ORDER BY reviewed_at DESC, id DESC LIMIT ?`,
        [informationId, limit],
      );
      return result.rows.map(mapReviewHistory);
    });
  }

  countReviewedBetween(from: number, to: number): Promise<number> {
    return withDbError('load review statistics', async () => {
      const result = await this.db.execute(
        `SELECT COUNT(*) AS total FROM review_history
         WHERE status = 'reviewed' AND reviewed_at BETWEEN ? AND ?`,
        [from, to],
      );
      return Number(result.rows[0]?.total ?? 0);
    });
  }
}
