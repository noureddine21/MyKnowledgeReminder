import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { describeError, logError } from '../utils/errors';

export interface FocusData<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Loads data every time the screen gains focus (so lists stay fresh after edits
 * in other screens) and whenever `loader` changes (e.g. search/filter changes).
 */
export function useFocusData<T>(loader: () => Promise<T>, context: string): FocusData<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await loader();
      if (id === requestId.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      logError(context, e);
      if (id === requestId.current) {
        setError(describeError(e));
      }
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  }, [loader, context]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { data, loading, error, reload };
}
