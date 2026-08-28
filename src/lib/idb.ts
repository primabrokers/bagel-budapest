/*
  A very small promise wrapper over IndexedDB. No dependency — this app needs four verbs (getAll,
  put, delete, clear) on one object store, and idb/dexie would be extra weight on the critical
  path of a phone app for that.

  Every function resolves to a harmless empty value when IndexedDB is unavailable rather than
  throwing: Safari private mode refuses to open a database, vitest's `node` environment has no
  IndexedDB at all, and neither is a reason for a page to fail. Callers treat persistence as an
  optimisation and keep their own in-memory copy — see fetchCache.ts.
*/

const DB_NAME = 'bm-planner';
const DB_VERSION = 1;

/** Cached query results behind useFetch. Keyed by the query key. */
export const CACHE_STORE = 'fetch-cache';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function available(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

export function openDb(): Promise<IDBDatabase | null> {
  if (!available()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null); // private mode, or storage disabled by policy
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    // A blocked open means another tab holds an older version. Don't hang the caller.
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T> | null,
  fallback: T,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve) => {
        if (!db) return resolve(fallback);
        let request: IDBRequest<T> | null;
        try {
          const tx = db.transaction(storeName, mode);
          request = body(tx.objectStore(storeName));
          tx.onabort = () => resolve(fallback);
        } catch {
          return resolve(fallback);
        }
        if (!request) return resolve(fallback);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(fallback);
      }),
  );
}

export function idbGetAll<T>(store: string): Promise<T[]> {
  return run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>, []);
}

export function idbPut(store: string, value: unknown): Promise<void> {
  return run(store, 'readwrite', (s) => s.put(value) as IDBRequest<unknown>, undefined).then(
    () => undefined,
  );
}

export function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  return run(store, 'readwrite', (s) => s.delete(key) as IDBRequest<unknown>, undefined).then(
    () => undefined,
  );
}

export function idbClear(store: string): Promise<void> {
  return run(store, 'readwrite', (s) => s.clear() as IDBRequest<unknown>, undefined).then(
    () => undefined,
  );
}

/** One transaction for the whole batch — the cache flushes a page's worth of queries at once. */
export function idbReplaceAll(store: string, values: unknown[]): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) return resolve();
        try {
          const tx = db.transaction(store, 'readwrite');
          const os = tx.objectStore(store);
          os.clear();
          for (const value of values) os.put(value);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      }),
  );
}
