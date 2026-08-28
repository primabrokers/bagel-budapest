import { useEffect, useState } from 'react';
import { useRouteError } from 'react-router-dom';
import { AlertTriangle, Home, Loader2, RefreshCw } from 'lucide-react';
import { isStaleChunkError, tryRecoverFromStaleChunk } from '../../lib/lazyPage';

/**
 * The router's shared `errorElement`. Two jobs:
 *
 *   1. Stale-chunk crashes ("Importing a module script failed" after a deploy replaces the
 *      hashed chunks a tab already had loaded): reload once, automatically — the user sees a
 *      brief "Updating…" flash rather than a dead error page.
 *   2. Anything else: a branded, recoverable error card instead of react-router's raw default.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const stale = isStaleChunkError(error);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (stale && tryRecoverFromStaleChunk()) setReloading(true);
  }, [stale]);

  if (stale && reloading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas text-text-muted">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        <div className="text-sm font-medium">Updating to the latest version…</div>
      </div>
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'statusText' in error
        ? String((error as { statusText?: string }).statusText ?? '')
        : String(error ?? 'Unknown error');

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-xl border border-separator bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gold-50 text-gold-700">
          <AlertTriangle size={22} aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">Something went wrong</h1>
        <p className="mt-2 text-sm text-text-muted">
          {stale
            ? 'The app needs a refresh to load the latest version.'
            : 'An unexpected error stopped this page from loading.'}
        </p>
        {message && !stale && (
          <p className="mt-2 break-words rounded-md bg-canvas px-3 py-2 text-xs text-text-faint">{message}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-md bg-plum-700 px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-plum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
          >
            <RefreshCw size={14} aria-hidden="true" /> Reload
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-separator-strong bg-surface px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
          >
            <Home size={14} aria-hidden="true" /> Back to home
          </a>
        </div>
      </div>
    </div>
  );
}
