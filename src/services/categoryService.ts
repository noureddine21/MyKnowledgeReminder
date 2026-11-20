import { getRepositories, inTransaction, type CategoryWithCount } from '../database/repositories';
import type { Category } from '../models';
import { AppError, NotFoundError, ValidationError, logError } from '../utils/errors';
import { validateCategoryName } from '../utils/validation';
import { resyncAllNotifications } from './reminderSync';

export async function listCategories(): Promise<Category[]> {
  const repos = await getRepositories();
  return repos.categories.findAll();
}

export async function listCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  const repos = await getRepositories();
  return repos.categories.findAllWithCounts();
}

export async function createCategory(name: string, color: string, icon: string): Promise<number> {
  const error = validateCategoryName(name);
  if (error) {
    throw new ValidationError({ name: error });
  }
  const repos = await getRepositories();
  return repos.categories.create(name, color, icon, Date.now());
}

export async function updateCategory(id: number, name: string, color: string, icon: string): Promise<void> {
  const error = validateCategoryName(name);
  if (error) {
    throw new ValidationError({ name: error });
  }
  const repos = await getRepositories();
  const category = await repos.categories.findById(id);
  if (!category) {
    throw new NotFoundError('The category');
  }
  if (category.isDefault && category.name.toLowerCase() !== name.trim().toLowerCase()) {
    throw new ValidationError({ name: 'Built-in categories cannot be renamed. You can change the color.' });
  }
  await repos.categories.update(id, name, color, icon);
  // Notification texts include the category: refresh them in the background.
  resyncAllNotifications().catch(e => logError('category:resync', e));
}

/** Deletes a custom category; its items are moved to "Other". */
export async function deleteCategory(id: number): Promise<void> {
  const repos = await getRepositories();
  const category = await repos.categories.findById(id);
  if (!category) {
    throw new NotFoundError('The category');
  }
  if (category.isDefault) {
    throw new AppError('VALIDATION', 'Built-in categories cannot be deleted.');
  }
  const fallback = await repos.categories.findByName('Other');
  await inTransaction(async tx => {
    await tx.categories.reassignItems(id, fallback?.id ?? null);
    await tx.categories.delete(id);
  });
  resyncAllNotifications().catch(e => logError('category:resync', e));
}
