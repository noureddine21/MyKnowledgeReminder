/**
 * Tags: free labels to organize items more finely than categories.
 * An item can have several tags; the library can be filtered by tag.
 */
import { getRepositories } from '../database/repositories';
import type { InformationItem, Tag, TagWithCount } from '../models';
import { ValidationError } from '../utils/errors';

export const MAX_TAG_LENGTH = 30;

/** Calm palette that fits the emerald & gold theme. */
export const TAG_COLORS = ['#0B4A3A', '#A87A12', '#2F6F8F', '#8E3B5E', '#4C6A2E', '#6B4FA0', '#B4532A', '#3D5A80'];

/** "#Tafsir " → "tafsir"; spaces become dashes. */
export function normalizeTagName(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

export function validateTagName(name: string): string | null {
  if (!name) {
    return 'Tag name is required.';
  }
  if (name.length > MAX_TAG_LENGTH) {
    return `A tag must be at most ${MAX_TAG_LENGTH} characters.`;
  }
  return null;
}

export async function listTags(): Promise<TagWithCount[]> {
  const repos = await getRepositories();
  return repos.tags.findAllWithCounts();
}

export async function createTag(rawName: string, now: number = Date.now()): Promise<Tag> {
  const name = normalizeTagName(rawName);
  const error = validateTagName(name);
  if (error) {
    throw new ValidationError({ tag: error });
  }
  const repos = await getRepositories();
  const count = (await repos.tags.findAllWithCounts()).length;
  const color = TAG_COLORS[count % TAG_COLORS.length];
  const id = await repos.tags.create(name, color, now);
  return { id, name, color };
}

export async function renameTag(id: number, rawName: string): Promise<void> {
  const name = normalizeTagName(rawName);
  const error = validateTagName(name);
  if (error) {
    throw new ValidationError({ tag: error });
  }
  const repos = await getRepositories();
  await repos.tags.rename(id, name);
}

export async function deleteTag(id: number): Promise<void> {
  const repos = await getRepositories();
  await repos.tags.delete(id);
}

/** Adds `tags` to each item (one query for all). */
export async function attachTags(items: InformationItem[]): Promise<InformationItem[]> {
  if (items.length === 0) {
    return items;
  }
  const repos = await getRepositories();
  const map = await repos.tags.findForItems(items.map(i => i.id));
  return items.map(item => ({ ...item, tags: map.get(item.id) ?? [] }));
}
