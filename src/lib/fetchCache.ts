// Cache backing useFetch, so moving between pages (or reloading the app on a phone) paints from
// what we already had instead of blocking on the network.
//
// Entries are keyed by the query function's source text plus its deps: two call sites with
// identical source ARE the same query, and deps carry the arguments. Nothing here decides data
// is still correct — useFetch always revalidates in the background — so a cached value is only
// ever a head start, never the final answer.
//
// PERSISTENCE IS INDEXEDDB. This app is installed as a PWA on a shared family device (a hallway
// iPad, a parent's laptop everyone signs into), so the cache has to survive one person swiping
// the app away and a cold launch — and it must not hand the next person who signs in the
// previous person's guest list. That shared-device property is kept by:
//
//   - every record carries the member it belongs to (`owner`);
//   - nothing is loaded from disk until setCacheOwner() says who is signed in, and only that
//     owner's records are loaded;
//   - hydration also deletes any record belonging to anyone else;
//   - sign-out still wipes the store outright (clearFetchCache).
//
// Reads stay SYNCHRONOUS. useFetch calls readCache() during render, so the in-memory Map remains
// the read path; IndexedDB only fills it. Because that fill is async and lands after first
// paint, subscribeToHydration() lets useFetch pick up a value that arrives late — the only way
// anything appears at all on a cold, offline launch, where the network request will never answer.

import { CACHE_STORE, idbClear, idbGetAll, idbReplaceAll } from './idb';

// Comfortably more than a session's worth of list pages, without an unbounded cache on a phone.
const MAX_ENTRIES = 300;
const MAX_ENTRY_BYTES = 512 * 1024;
// Past this, a cached value is more likely to mislead than to help, so callers see a spinner
// instead of stale figures.
const MAX_AGE_MS = 30 * 60_000;

interface Entry {
  value: unknown;
  storedAt: number;
}

interface StoredRecord extends Entry {
  key: string;
  owner: string;
}

const memory = new Map<string, Entry>();
let flushHandle: ReturnType<typeof setTimeout> | null = null;

/** The signed-in member these entries belong to. Null until sign-in; nothing persists before then. */
let owner: string | null = null;
let hydrated = false;
const hydrationListeners = new Set<() => void>();

export function cacheKey(fn: () => unknown, deps: unknown[]): string | null {
  let depsPart: string;
  try {
    depsPart = JSON.stringify(deps);
  } catch {
    // A dep that will not serialise (a function, a cyclic object) cannot be keyed reliably, so
    // this query opts out of caching entirely.
    return null;
  }
  if (depsPart === undefined) return null;
  return `${fn.toString()}::${depsPart}`;
}

/**
 * Called once the signed-in member is known (the app shell, after auth resolves). Loads that
 * member's records off disk and drops everybody else's. Re-calling with the same owner is a
 * no-op; calling with a DIFFERENT owner means a second family member signed in on this device, so
 * the previous member's cache is discarded rather than merged.
 */
export function setCacheOwner(next: string | null): void {
  if (next === owner) return;
  const changed = owner !== null && next !== owner;
  owner = next;
  if (changed) {
    memory.clear();
    hydrated = false;
  }
  if (!next) return;
  void hydrateFromDisk(next);
}

async function hydrateFromDisk(forOwner: string): Promise<void> {
  try {
    const records = await idbGetAll<StoredRecord>(CACHE_STORE);
    // A second sign-in may have happened while this was in flight.
    if (owner !== forOwner) return;
    const cutoff = Date.now() - MAX_AGE_MS;
    let foreignOrStale = false;
    for (const record of records) {
      if (!record || typeof record.storedAt !== 'number') continue;
      if (record.owner !== forOwner || record.storedAt <= cutoff) {
        foreignOrStale = true;
        continue;
      }
      // A value already written this session is newer than anything on disk.
      if (!memory.has(record.key)) {
        memory.set(record.key, { value: record.value, storedAt: record.storedAt });
      }
    }
    // Rewrite the store from what we kept, which is also how another member's rows (and expired
    // ones) get deleted rather than lingering on the device.
    if (foreignOrStale) scheduleFlush();
  } catch {
    // Storage unavailable or corrupt — carry on with an empty in-memory cache.
  } finally {
    if (owner === forOwner) {
      hydrated = true;
      hydrationListeners.forEach((listener) => listener());
    }
  }
}

/**
 * Notified once the disk cache has been folded into memory. useFetch uses this to adopt a value
 * that lands after its first render — offline, that is the only way anything ever appears,
 * because the network request will never return.
 */
export function subscribeToHydration(listener: () => void): () => void {
  hydrationListeners.add(listener);
  return () => {
    hydrationListeners.delete(listener);
  };
}

/** False while a signed-in session is still waiting for its disk cache. */
export function isCacheHydrated(): boolean {
  return owner === null || hydrated;
}

function scheduleFlush(): void {
  if (flushHandle !== null) return;
  // Coalesce the writes from a page's worth of queries into one transaction.
  flushHandle = setTimeout(() => {
    flushHandle = null;
    const forOwner = owner;
    if (!forOwner) return; // signed out mid-timer; nothing may be persisted
    const records: StoredRecord[] = [];
    for (const [key, entry] of memory) {
      records.push({ key, owner: forOwner, value: entry.value, storedAt: entry.storedAt });
    }
    void idbReplaceAll(CACHE_STORE, records);
  }, 500);
}

export function readCache<T>(key: string | null): T | undefined {
  if (key === null) return undefined;
  const entry = memory.get(key);
  if (entry === undefined) return undefined;
  if (Date.now() - entry.storedAt > MAX_AGE_MS) {
    memory.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function writeCache(key: string | null, value: unknown): void {
  if (key === null || value === undefined) return;

  let size: number;
  try {
    size = JSON.stringify(value)?.length ?? 0;
  } catch {
    return; // not serialisable — keep it out of the cache rather than throw
  }
  if (size === 0 || size > MAX_ENTRY_BYTES) return;

  // Re-inserting moves the key to the end, so the Map's insertion order is a
  // least-recently-written list and the first key is the one to evict.
  memory.delete(key);
  memory.set(key, { value, storedAt: Date.now() });
  while (memory.size > MAX_ENTRIES) {
    const oldest = memory.keys().next();
    if (oldest.done) break;
    memory.delete(oldest.value);
  }
  scheduleFlush();
}

/**
 * What the cache actually holds right now, so an offline banner (Stage 2b+) can say something
 * true instead of promising data. `newestAt` is the most recent write still inside MAX_AGE_MS;
 * older entries are already dead to readCache, so they must not count towards "last synced"
 * either.
 */
export function fetchCacheFreshness(): { entries: number; newestAt: number | null } {
  const cutoff = Date.now() - MAX_AGE_MS;
  let entries = 0;
  let newestAt: number | null = null;
  for (const entry of memory.values()) {
    if (entry.storedAt <= cutoff) continue;
    entries += 1;
    if (newestAt === null || entry.storedAt > newestAt) newestAt = entry.storedAt;
  }
  return { entries, newestAt };
}

// Called on sign-out. Anything cached belongs to the session that just ended, and on a shared
// device the next person must not inherit it — so this wipes the DISK too, not just memory.
// Deliberately not awaited: sign-out should not block on storage.
export function clearFetchCache(): void {
  memory.clear();
  owner = null;
  hydrated = false;
  if (flushHandle !== null) {
    clearTimeout(flushHandle);
    flushHandle = null;
  }
  void idbClear(CACHE_STORE);
}
