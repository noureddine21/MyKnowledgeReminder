/**
 * Routines: tasks repeated on chosen weekdays ("Sport 1h every Mon/Wed/Fri"),
 * added automatically when today's plan is organized.
 */
import { getRepositories } from '../database/repositories';
import type { Routine, RoutineInput } from '../models';
import { ValidationError } from '../utils/errors';
import { MAX_TASK_MINUTES, MIN_TASK_MINUTES, type ParsedTask } from './dayPlanner';

export function validateRoutine(input: RoutineInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = input.title.trim();
  if (!title) {
    errors.title = 'Give the routine a name.';
  } else if (title.length > 150) {
    errors.title = 'The name must be at most 150 characters.';
  }
  if (!Number.isInteger(input.durationMin) || input.durationMin < MIN_TASK_MINUTES || input.durationMin > MAX_TASK_MINUTES) {
    errors.duration = 'Duration must be between 5 min and 12 h.';
  }
  if (input.fixedStartMin !== null && (!Number.isInteger(input.fixedStartMin) || input.fixedStartMin < 0 || input.fixedStartMin > 1439)) {
    errors.time = 'Invalid time.';
  }
  if (input.days.length === 0 || input.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
    errors.days = 'Choose at least one day.';
  }
  return errors;
}

export async function listRoutines(): Promise<Routine[]> {
  const repos = await getRepositories();
  return repos.routines.findAll();
}

export async function saveRoutine(input: RoutineInput, id?: number, now: number = Date.now()): Promise<number> {
  const clean: RoutineInput = { ...input, title: input.title.trim(), days: [...new Set(input.days)].sort() };
  const errors = validateRoutine(clean);
  if (Object.keys(errors).length > 0) {
    throw new ValidationError(errors);
  }
  const repos = await getRepositories();
  if (id === undefined) {
    return repos.routines.insert(clean, now);
  }
  await repos.routines.update(id, clean);
  return id;
}

export async function deleteRoutine(id: number): Promise<void> {
  const repos = await getRepositories();
  await repos.routines.delete(id);
}

/** Active routines planned on the weekday of `day`. */
export function routinesForDay(routines: Routine[], day: number): Routine[] {
  const weekday = new Date(day).getDay();
  return routines.filter(r => r.isActive && r.days.includes(weekday));
}

function sameTitle(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Adds today's routines to the user's tasks (unless a task with the same name is
 * already in the list), after the user's own tasks.
 */
export function mergeRoutines(tasks: ParsedTask[], routines: Routine[]): ParsedTask[] {
  const merged = [...tasks];
  for (const routine of routines) {
    if (merged.some(t => sameTitle(t.title, routine.title))) {
      continue;
    }
    merged.push({
      title: routine.title,
      durationMin: routine.durationMin,
      fixedStartMin: routine.fixedStartMin,
      important: routine.important,
      position: merged.length,
    });
  }
  return merged;
}
