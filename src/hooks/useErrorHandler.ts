import { useCallback } from 'react';
import { Alert } from 'react-native';
import { describeError, logError } from '../utils/errors';

/** Returns a function that logs an error and shows a user-friendly alert. */
export function useErrorHandler() {
  return useCallback((error: unknown, context = 'ui', title = 'Something went wrong') => {
    logError(context, error);
    Alert.alert(title, describeError(error));
  }, []);
}
