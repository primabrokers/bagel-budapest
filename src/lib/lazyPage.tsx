import { Suspense, lazy, type ComponentType } from 'react';
import { PageFallback } from './PageFallback';

// Route-level code splitting + stale-chunk self-heal. Route-agnostic on purpose — this app's
// route table (Stage 2b) calls `lazyPage()` per route; nothing here imports react-router.

// After a deploy, the previous build's content-hashed chunks no longer exist, so a tab (or the
// service worker's cached shell) holding old index.html fails every lazy import with "Importing
// a module script failed" / "Failed to fetch dynamically imported module". Self-heal: retry
// once for transient blips, then force ONE full reload (fresh index.html -> valid chunk refs).
// sessionStorage guards against a reload loop when the network is genuinely down — then the
// error surfaces to a route error boundary instead.
const CHUNK_RELOAD_GUARD_KEY = 'bm-planner-chunk-reload-at';

export function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module|css chunk load failed/i.test(msg);
}

export function tryRecoverFromStaleChunk(): boolean {
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) ?? 0);
  if (Date.now() - last < 60_000) return false; // reloaded recently and still broken
  sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(Date.now()));
  window.location.reload();
  return true;
}

function loadWithRecovery<M>(load: () => Promise<M>): Promise<M> {
  return load().catch(async (err) => {
    // One quiet retry for transient network blips.
    await new Promise((r) => setTimeout(r, 1000));
    try {
      return await load();
    } catch (err2) {
      if (isStaleChunkError(err2) && tryRecoverFromStaleChunk()) {
        return new Promise<M>(() => {}); // page is reloading — never resolve
      }
      throw err2 ?? err;
    }
  });
}

/**
 * Route-level code splitting. Every page module in this app uses a NAMED export, so this maps
 * the requested export onto `default` for `React.lazy()`. The Suspense boundary lives inside the
 * returned component, so the route element tree stays unchanged (props, children and any
 * `<Outlet />` all pass through).
 *
 *   const GuestsPage = lazyPage(() => import('./pages/GuestsPage'), 'GuestsPage');
 */
export function lazyPage<M extends Record<string, unknown>, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
) {
  const C = lazy(() =>
    loadWithRecovery(load).then((m) => ({ default: m[name] as unknown as ComponentType<Record<string, unknown>> })),
  );
  return function LazyRoute(props: Record<string, unknown>) {
    return (
      <Suspense fallback={<PageFallback />}>
        <C {...props} />
      </Suspense>
    );
  };
}
