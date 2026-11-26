/**
 * Centralized error types and helpers.
 * Every layer throws AppError (or a subclass) with a message that is safe to show to the user.
 */

export type ErrorCode =
  | 'DATABASE'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'NOTIFICATION'
  | 'PERMISSION'
  | 'BACKUP'
  | 'NATIVE'
  | 'UNKNOWN';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly cause?: unknown;

  constructor(code: ErrorCode, userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

export class ValidationError extends AppError {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super('VALIDATION', Object.values(fieldErrors)[0] ?? 'Please check the form.');
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export class DatabaseError extends AppError {
  constructor(operation: string, cause?: unknown) {
    super('DATABASE', `Could not ${operation}. Please try again.`, cause);
    this.name = 'DatabaseError';
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string) {
    super('NOT_FOUND', `${entity} was not found. It may have been deleted.`);
    this.name = 'NotFoundError';
  }
}

export function describeError(error: unknown): string {
  if (error instanceof AppError) {
    return error.userMessage;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'An unexpected error occurred.';
}

/** Logs an error with context. Single place to plug in crash reporting later. */
export function logError(context: string, error: unknown): void {
  const cause = error instanceof AppError ? error.cause : undefined;
  console.error(`[${context}]`, error, cause ?? '');
}

/** Runs a database operation and wraps any failure into a DatabaseError. */
export async function withDbError<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError(`db:${operation}`, error);
    throw new DatabaseError(operation, error);
  }
}
