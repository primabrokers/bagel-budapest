import { createContext, useContext, type ReactNode } from 'react';

/**
 * The current family member's event identity — resolved once by AppShell (via
 * `ensureEventProvisioned()`) and handed down to everything under `<Outlet />`. Every page in
 * this app plans exactly one event for one family, so this is the whole of "which event/who am
 * I", not a switchable multi-tenant selection.
 */
export interface EventContextValue {
  eventId: string;
  memberId: string;
}

const EventContext = createContext<EventContextValue | null>(null);

interface EventProviderProps extends EventContextValue {
  children: ReactNode;
}

export function EventProvider({ eventId, memberId, children }: EventProviderProps) {
  return <EventContext.Provider value={{ eventId, memberId }}>{children}</EventContext.Provider>;
}

/**
 * Deliberately colocated with `EventProvider` above rather than split into a second file — the
 * provider and the hook that reads it are one unit, the same way this app's own
 * ToastHost/ConfirmHost stores keep their `show*`/`use*` pairs together. Every consumer lives
 * inside AppShell's authenticated tree, wrapped in `EventProvider` by the time it renders, so a
 * call from outside one is a bug worth throwing on rather than a state any screen renders around.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useEventContext(): EventContextValue {
  const ctx = useContext(EventContext);
  if (!ctx) {
    throw new Error(
      'useEventContext() was called outside an EventProvider. Every page renders under ' +
        'AppShell, which wraps the authenticated tree in one once provisioning resolves.',
    );
  }
  return ctx;
}
