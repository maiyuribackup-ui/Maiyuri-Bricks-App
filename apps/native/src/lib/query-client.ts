import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mobile networks are flaky; give cached data a sensible lifetime.
      staleTime: 30_000,
      // Keep data in cache long enough to survive offline app restarts —
      // must be >= the persister maxAge below or restored data is dropped.
      gcTime: 24 * 60 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Persist the query cache to AsyncStorage so the app opens instantly with
 * last-known data on brick-yard / site-visit connectivity (or fully offline),
 * then refetches in the background.
 */
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'mb.query-cache',
  throttleTime: 2_000,
});

export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000; // 24h
