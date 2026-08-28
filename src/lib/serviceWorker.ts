// Client-side service worker registration. The worker script itself (public/sw.js) and its
// build-time cache-busting stamp are Stage 2b/11 concerns (the PWA-finish stage per the build
// plan) — this is only the half that runs in the page: register, throttle update checks, and
// hand an UpdateBanner (Stage 2b) a way to apply an update on explicit user action, never
// automatically.

type UpdateCallback = () => void;

let updateCallback: UpdateCallback | null = null;
let waitingWorker: ServiceWorker | null = null;
// Only reload on controllerchange when the user explicitly asked for the update (via
// applyUpdate). A background activation (e.g. another tab applying the update) must never yank
// this tab's page out from under whatever it is doing — halfway through editing a guest list is
// the wrong moment for an unannounced reload.
let userInitiatedUpdate = false;

export function onUpdateAvailable(cb: UpdateCallback) {
  updateCallback = cb;
}

export function applyUpdate() {
  userInitiatedUpdate = true;
  if (waitingWorker) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    // Fallback in case controllerchange doesn't fire (e.g. the worker is already redundant).
    setTimeout(() => window.location.reload(), 1000);
  } else {
    window.location.reload();
  }
}

/** Shortest gap between two update checks — the visibilitychange listener below fires on every
 *  return to the app (camera, phone call, another app), and each check is a guaranteed network
 *  fetch of sw.js (see updateViaCache below), so it is throttled rather than run on every event. */
const UPDATE_CHECK_MIN_INTERVAL_MS = 60_000;

export function registerServiceWorker(scriptUrl = '/sw.js') {
  if (!('serviceWorker' in navigator)) return;

  const start = async () => {
    try {
      // updateViaCache:'none' forces the browser to fetch a FRESH sw.js on every update check
      // (never the HTTP cache), so a new deploy is actually detected and the banner appears.
      const registration = await navigator.serviceWorker.register(scriptUrl, { updateViaCache: 'none' });

      let lastCheck = Date.now();
      const checkForUpdate = () => {
        if (Date.now() - lastCheck < UPDATE_CHECK_MIN_INTERVAL_MS) return;
        lastCheck = Date.now();
        registration.update();
      };

      // Check every 15 minutes while the app is open; visibilitychange below covers the common
      // "family member returns to the app" case without hammering the server on every switch.
      setInterval(checkForUpdate, 15 * 60_000);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });

      // If there's already a waiting worker from a previous update cycle, notify immediately.
      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting;
        updateCallback?.();
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = newWorker;
            updateCallback?.();
          }
        });
      });

      // Reload ONLY if this tab's user clicked "Update now" — see the comment on
      // userInitiatedUpdate above.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (userInitiatedUpdate) window.location.reload();
      });

      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'sw-updated') {
          // New version activated in another tab.
          updateCallback?.();
        }
      });
    } catch (err) {
      console.warn('Service worker registration failed:', err);
    }
  };

  // Registering inside a bare `load` listener assumes load has not fired yet — true only if this
  // runs at module scope early in main.tsx. Checking readyState rather than trusting the caller
  // means a future move behind a dynamic import doesn't silently stop the worker from ever
  // registering.
  if (document.readyState === 'complete') {
    void start();
  } else {
    window.addEventListener('load', () => void start(), { once: true });
  }
}
