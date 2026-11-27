import type { Migration } from './types';

/** Tags: finer organization than categories (an item can have several tags). */
export const migration006: Migration = {
  version: 6,
  name: 'tags',
  statements: [
    `CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
      color TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS information_tags (
      information_id INTEGER NOT NULL REFERENCES information(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (information_id, tag_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_information_tags_tag ON information_tags(tag_id)',
  ],
};
