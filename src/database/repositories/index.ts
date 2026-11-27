import { getDatabase } from '../connection';
import type { SqlExecutor } from '../types';
import { CategoryRepository } from './categoryRepository';
import { InformationRepository } from './informationRepository';
import { PlanRepository } from './planRepository';
import { ReminderRepository } from './reminderRepository';
import { RoutineRepository } from './routineRepository';
import { ReviewHistoryRepository } from './reviewHistoryRepository';
import { SettingsRepository } from './settingsRepository';
import { TagRepository } from './tagRepository';

export interface Repositories {
  categories: CategoryRepository;
  information: InformationRepository;
  plans: PlanRepository;
  reminders: ReminderRepository;
  routines: RoutineRepository;
  reviewHistory: ReviewHistoryRepository;
  settings: SettingsRepository;
  tags: TagRepository;
}

export function createRepositories(executor: SqlExecutor): Repositories {
  return {
    categories: new CategoryRepository(executor),
    information: new InformationRepository(executor),
    plans: new PlanRepository(executor),
    reminders: new ReminderRepository(executor),
    routines: new RoutineRepository(executor),
    reviewHistory: new ReviewHistoryRepository(executor),
    settings: new SettingsRepository(executor),
    tags: new TagRepository(executor),
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
  PlanRepository,
  ReminderRepository,
  ReviewHistoryRepository,
  RoutineRepository,
  SettingsRepository,
  TagRepository,
};
export type { CategoryWithCount } from './categoryRepository';
