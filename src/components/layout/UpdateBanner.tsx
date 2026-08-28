import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { onUpdateAvailable, applyUpdate } from '../../lib/serviceWorker';

// sessionStorage, not localStorage: "Later" must never be permanent — a dismissal that outlives
// the app window is how a family ends up running a build from three deploys ago. This one dies
// with the window (the prompt is back on the next launch) and re-arms after SNOOZE_MS anyway.
const SNOOZE_KEY = 'bm-planner-update-snoozed-until';
const SNOOZE_MS = 4 * 60 * 60_000;

function snoozedUntil(): number {
  try {
    return Number(sessionStorage.getItem(SNOOZE_KEY) ?? 0);
  } catch {
    return 0; // Safari private mode throws on read; showing the prompt is the safe side.
  }
}

/** Mounted once, above the router — a waiting update matters on `/login` too, not only once
 *  signed in. Reload only ever happens on an explicit tap; see `serviceWorker.ts`. */
export function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [snoozed, setSnoozed] = useState(() => snoozedUntil() > Date.now());

  useEffect(() => {
    onUpdateAvailable(() => setUpdateReady(true));
  }, []);

  useEffect(() => {
    if (updateReady && !snoozed) requestAnimationFrame(() => setVisible(true));
  }, [updateReady, snoozed]);

  // Bring it back when the snooze runs out, without waiting for a reload.
  useEffect(() => {
    if (!snoozed) return;
    const remaining = Math.max(0, snoozedUntil() - Date.now());
    const id = setTimeout(() => setSnoozed(false), remaining + 1_000);
    return () => clearTimeout(id);
  }, [snoozed]);

  const snooze = useCallback(() => {
    try {
      sessionStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      /* storage unavailable — the in-memory flag below still hides it for this session */
    }
    setVisible(false);
    setSnoozed(true);
  }, []);

  if (!updateReady || snoozed) return null;

  return (
    <div
      role="status"
      // bottom-above-tabbar (globals.css) clears the phone tab rail so "Update now" doesn't sit
      // on top of the More tab and swallow the press.
      className="bottom-above-tabbar fixed inset-x-4 z-[9999] flex items-center gap-3 rounded-lg border border-plum-200 bg-plum-50 px-4 py-3 shadow-lg transition duration-300 lg:inset-x-auto lg:right-4 lg:max-w-sm"
      style={{ transform: visible ? 'translateY(0)' : 'translateY(1rem)', opacity: visible ? 1 : 0 }}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum-100">
        <Download size={16} className="text-plum-700" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-plum-900">Update available</p>
        <p className="text-xs text-plum-700">A new version of the planner is ready. Takes a second.</p>
      </div>
      <button
        type="button"
        onClick={snooze}
        className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-plum-700 transition-colors hover:bg-plum-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-500 focus-visible:ring-offset-2 focus-visible:ring-offset-plum-50"
      >
        Later
      </button>
      <button
        type="button"
        onClick={applyUpdate}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-plum-700 px-3 py-1.5 text-xs font-medium text-text-inverse transition-colors hover:bg-plum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-500 focus-visible:ring-offset-2 focus-visible:ring-offset-plum-50"
      >
        <RefreshCw size={12} aria-hidden="true" />
        Update now
      </button>
    </div>
  );
}
