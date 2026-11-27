import type { Migration } from './types';

/**
 * Better information items:
 *  - flashcard question, favorite, mastery level (0 new … 5 mastered);
 *  - a photo and a voice note (files kept in the app's private storage);
 *  - collections (ordered series, e.g. "40 Hadith Nawawi") and links between items.
 */
export const migration008: Migration = {
  version: 8,
  name: 'information_plus',
  statements: [
    `CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
      color TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    'ALTER TABLE information ADD COLUMN question TEXT',
    'ALTER TABLE information ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1))',
    'ALTER TABLE information ADD COLUMN mastery INTEGER NOT NULL DEFAULT 0 CHECK (mastery BETWEEN 0 AND 5)',
    'ALTER TABLE information ADD COLUMN image_path TEXT',
    'ALTER TABLE information ADD COLUMN audio_path TEXT',
    'ALTER TABLE information ADD COLUMN collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL',
    'ALTER TABLE information ADD COLUMN collection_position INTEGER',
    'CREATE INDEX IF NOT EXISTS idx_information_collection ON information(collection_id, collection_position)',
    `CREATE TABLE IF NOT EXISTS information_links (
      a_id INTEGER NOT NULL REFERENCES information(id) ON DELETE CASCADE,
      b_id INTEGER NOT NULL REFERENCES information(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (a_id, b_id),
      CHECK (a_id < b_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_information_links_b ON information_links(b_id)',
    // Items already reviewed start at "learning" instead of "new".
    `UPDATE information SET mastery = 1
     WHERE id IN (SELECT DISTINCT information_id FROM review_history WHERE status = 'reviewed')`,
  ],
};
