/**
 * Collections: ordered series of items ("40 Hadith Nawawi", "React course")
 * with a progress bar (items learned / total).
 */
import { getRepositories, inTransaction } from '../database/repositories';
import type { Collection, CollectionWithProgress } from '../models';
import { ValidationError } from '../utils/errors';

export const MAX_COLLECTION_NAME_LENGTH = 40;

/** Calm palette that fits the emerald & gold theme. */
export const COLLECTION_COLORS = ['#0B4A3A', '#A87A12', '#2F6F8F', '#8E3B5E', '#4C6A2E', '#6B4FA0', '#B4532A', '#3D5A80'];

export function validateCollectionName(raw: string): string | null {
  const name = raw.trim();
  if (!name) {
    return 'Collection name is required.';
  }
  if (name.length > MAX_COLLECTION_NAME_LENGTH) {
    return `A collection name must be at most ${MAX_COLLECTION_NAME_LENGTH} characters.`;
  }
  return null;
}

export async function listCollections(): Promise<CollectionWithProgress[]> {
  const repos = await getRepositories();
  return repos.collections.findAllWithProgress();
}

export async function getCollection(id: number): Promise<Collection | null> {
  const repos = await getRepositories();
  return repos.collections.findById(id);
}

export async function createCollection(rawName: string, now: number = Date.now()): Promise<Collection> {
  const error = validateCollectionName(rawName);
  if (error) {
    throw new ValidationError({ name: error });
  }
  const name = rawName.trim();
  const repos = await getRepositories();
  const count = (await repos.collections.findAllWithProgress()).length;
  const color = COLLECTION_COLORS[count % COLLECTION_COLORS.length];
  const id = await repos.collections.create(name, color, now);
  return { id, name, color, createdAt: now };
}

export async function renameCollection(id: number, rawName: string): Promise<void> {
  const error = validateCollectionName(rawName);
  if (error) {
    throw new ValidationError({ name: error });
  }
  const repos = await getRepositories();
  const existing = await repos.collections.findById(id);
  if (existing) {
    await repos.collections.update(id, rawName.trim(), existing.color);
  }
}

export async function deleteCollection(id: number): Promise<void> {
  await inTransaction(tx => tx.collections.delete(id));
}

/** Moves an item one place up (-1) or down (+1) in its collection (swaps with its neighbour). */
export async function moveInCollection(informationId: number, direction: -1 | 1): Promise<void> {
  const repos = await getRepositories();
  const item = await repos.information.findById(informationId);
  if (!item?.collectionId) {
    return;
  }
  const items = await repos.information.findAll({ collectionId: item.collectionId });
  const index = items.findIndex(i => i.id === informationId);
  const other = items[index + direction];
  if (index < 0 || !other) {
    return;
  }
  await inTransaction(async tx => {
    // Renumber 1…n in the new order (also repairs gaps or duplicates).
    const order = [...items];
    [order[index], order[index + direction]] = [order[index + direction], order[index]];
    for (let i = 0; i < order.length; i++) {
      if (order[i].collectionPosition !== i + 1) {
        await tx.information.setCollectionPosition(order[i].id, i + 1);
      }
    }
  });
}
