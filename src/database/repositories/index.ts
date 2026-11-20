import { getDatabase } from '../connection';
import type { SqlExecutor } from '../types';
import { CategoryRepository } from './categoryRepository';
import { InformationRepository } from './informationRepository';
import { ReminderRepository } from './reminderRepository';
import { ReviewHistoryRepository } from './reviewHistoryRepository';
import { SettingsRepository } from './settingsRepository';

export interface Repositories {
  categories: CategoryRepository;
  information: InformationRepository;
  reminders: ReminderRepository;
  reviewHistory: ReviewHistoryRepository;
  settings: SettingsRepository;
}

export function createRepositories(executor: SqlExecutor): Repositories {
  return {
    categories: new CategoryRepository(executor),
    information: new InformationRepository(executor),
    reminders: new ReminderRepository(executor),
    reviewHistory: new ReviewHistoryRepository(executor),
    settings: new SettingsRepository(executor),
  };
}

/** Repositories bound to the main connection. */
export async function getRepositories(): Promise<Repositories> {
  return createRepositories(await getDatabase());
}

/** Runs `fn` atomically; every repository call inside uses the same transaction. */
export async function inTransaction<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
  const db = await getDatabase();
  let value: T | undefined;
  await db.transaction(async tx => {
    value = await fn(createRepositories(tx));
  });
  return value as T;
}

export {
  CategoryRepository,
  InformationRepository,
  ReminderRepository,
  ReviewHistoryRepository,
  SettingsRepository,
};
export type { CategoryWithCount } from './categoryRepository';
