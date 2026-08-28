import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { setCacheOwner } from '../../lib/fetchCache';
import { ensureEventProvisioned, type ProvisionedEvent } from '../../data/event/provisioning';
import { EventProvider } from '../../data/event/context';
import { NoAccessPage } from '../auth/NoAccessPage';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileTabBar } from './MobileTabBar';
import { MobileMoreSheet } from './MobileMoreSheet';
import { CommandPalette } from '../search/CommandPalette';
import { DocumentTitle } from './DocumentTitle';

type AuthState = 'checking' | 'signed-out' | 'signed-in';

/**
 * `'pending'` while `ensureEventProvisioned()` is in flight (or hasn't started), `'none'` for a
 * signed-in account with no linked event (render `NoAccessPage`), or the resolved
 * `{eventId, memberId}` to provide via `EventContext`.
 */
type Provisioning = 'pending' | 'none' | ProvisionedEvent;

/**
 * The auth gate AND the shell layout, in one component. Every authenticated route renders
 * through this as the router's `/` parent, arriving via `<Outlet />`.
 *
 *   - `checking` — the one-off `getSession()` round trip hasn't resolved yet: a centred spinner.
 *   - `signed-out` — no session: bounce to `/login`.
 *   - `signed-in`, provisioning `pending` — `bm_ensure_event_provisioned()` is running: the same
 *     spinner, since a family member has no reason to tell the two loading states apart.
 *   - `signed-in`, provisioning `none` — this account isn't linked to any event: `NoAccessPage`.
 *   - `signed-in`, provisioning resolved — render the shell chrome, wrapped in `EventProvider` so
 *     every page under `<Outlet />` can call `useEventContext()` / `useEvent()`.
 */
export function AppShell() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [userId, setUserId] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState<Provisioning>('pending');
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  // Close the phone "More" launcher whenever the route changes underneath it.
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) setCacheOwner(session.user.id);
      setUserId(session ? session.user.id : null);
      setAuthState(session ? 'signed-in' : 'signed-out');
    });

    // Covers everything getSession() can't: a sign-in/out that happens while this tab is open,
    // and a token refresh landing. setCacheOwner is a no-op for a repeat call with the same id,
    // so calling it again here for the session getSession() already saw costs nothing.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session) {
        setCacheOwner(session.user.id);
        setUserId(session.user.id);
        setAuthState('signed-in');
      } else {
        // A shared family device (a hallway iPad, a parent's laptop) must not hand the next
        // person who signs in the previous member's cached guest list, budget or documents.
        setCacheOwner(null);
        setUserId(null);
        setAuthState('signed-out');
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Provision the signed-in user's event. Keyed on `userId`, not just `authState` — a token
  // refresh fires onAuthStateChange with the SAME user id, which must not re-run the RPC, but a
  // sign-out followed by a DIFFERENT family member signing in on the same device is a real
  // identity change and must re-provision rather than leaving the previous member's event/member
  // id in EventContext.
  useEffect(() => {
    if (authState !== 'signed-in' || !userId) {
      setProvisioning('pending');
      return;
    }
    let cancelled = false;
    setProvisioning('pending');
    ensureEventProvisioned()
      .then((result) => {
        if (cancelled) return;
        setProvisioning(result ?? 'none');
      })
      .catch((error) => {
        console.error('Failed to provision this account against an event:', error);
        // No separate error state exists — see the Provisioning type above — so an unexpected
        // failure (a network blip, not "no event") falls back to NoAccessPage, whose sign-out
        // button is a real recovery path rather than an infinite spinner.
        if (cancelled) return;
        setProvisioning('none');
      });
    return () => {
      cancelled = true;
    };
  }, [authState, userId]);

  if (authState === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" aria-hidden="true" />
      </div>
    );
  }

  if (authState === 'signed-out') return <Navigate to="/login" replace />;

  // authState is 'signed-in' from here on — checked as its own statement (rather than folded
  // into the compound condition above) so TS can narrow `provisioning` down to ProvisionedEvent
  // by the end of these two checks, the same way it narrows `authState` above.
  if (provisioning === 'pending') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" aria-hidden="true" />
      </div>
    );
  }

  if (provisioning === 'none') return <NoAccessPage />;

  const { eventId, memberId } = provisioning;

  return (
    <EventProvider eventId={eventId} memberId={memberId}>
      {/* Mounted once, near the top of the authenticated tree, per its own doc comment — owns its
          own ⌘K/Ctrl+K listener and open state (hooks/useCommandPalette.ts), so TopBar's and
          Sidebar's search triggers can open it with no props threaded through here. */}
      <CommandPalette />
      <DocumentTitle />
      <div className="flex min-h-dvh w-full flex-col bg-canvas">
        <TopBar />
        <div className="flex w-full min-h-0 flex-1">
          <div className="hidden lg:flex">
            <Sidebar />
          </div>
          {/* pb-tabbar clears the fixed phone tab bar; it's a no-op once the sidebar takes over. */}
          <main className="pb-tabbar min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>

        <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
        <MobileTabBar onMore={() => setMoreOpen((open) => !open)} moreOpen={moreOpen} />
      </div>
    </EventProvider>
  );
}
