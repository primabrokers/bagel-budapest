import { useCallback, useEffect, useRef, useState } from 'react';
import { cacheKey, isCacheHydrated, readCache, subscribeToHydration, writeCache } from './fetchCache';

export interface FetchResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
}

/**
 * Fetch-on-mount with a stale-while-revalidate cache. No react-query in this project — see
 * CLAUDE.md — this hook plus fetchCache.ts is the whole data layer, and every domain hook in
 * src/data/ (Stage 3+) is built on it.
 *
 * A cache hit paints the last known rows immediately with `loading` false, then refetches in the
 * background and swaps the fresh result in. That is what stops a phone re-querying Supabase on
 * every page change and reload. A miss behaves as before: `loading` stays true until the request
 * lands.
 *
 * Every mount still revalidates, so cached data is only ever a head start — anything stale
 * corrects itself as soon as the request returns.
 */
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[]): FetchResult<T> {
  const key = cacheKey(fn, deps);
  const cached = readCache<T>(key);

  const [data, setData] = useState<T | undefined>(cached);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState<Error | undefined>(undefined);

  // When deps change mid-mount (navigating to a different record) the previous record's rows
  // must not linger on screen, so re-seed from the new key's cache — or clear back to a spinner
  // when it has none.
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    lastKey.current = key;
    const next = readCache<T>(key);
    setData(next);
    setLoading(next === undefined);
    setError(undefined);
  }

  const reload = useCallback(() => {
    let cancelled = false;
    // Only block the UI when there is nothing to show. With a cache hit the revalidation is
    // silent, so the page does not flash a spinner over data the user is already reading.
    if (readCache<T>(key) === undefined) setLoading(true);
    setError(undefined);
    fn()
      .then((d) => {
        // Cache even if this caller unmounted — the next mount benefits.
        writeCache(key, d);
        if (cancelled) return;
        setData(d);
        setError(undefined);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const cancel = reload();
    return cancel;
  }, [reload]);

  // The disk cache is read asynchronously, so on a cold launch it lands AFTER this hook's first
  // render. Online that rarely matters — the revalidation above usually wins. Offline it is the
  // only thing that ever arrives, because the request will never return, and without this the
  // screen would sit on a spinner over data the device actually has. Only adopts a value when
  // still empty, so it can never overwrite a fresher network result.
  useEffect(() => {
    if (isCacheHydrated()) return;
    return subscribeToHydration(() => {
      const fromDisk = readCache<T>(key);
      if (fromDisk === undefined) return;
      setData((current) => (current === undefined ? fromDisk : current));
      setLoading(false);
    });
  }, [key]);

  return { data, loading, error, reload };
}
