import { useEffect } from 'react';
import { useEvent } from '../../data/event/hooks';

const DEFAULT_TITLE = 'Bar Mitzvah Planner';

/**
 * Sets `document.title` to `"${boy_name}'s Bar Mitzvah Planner"` once the event record loads.
 * Mounted only inside `AppShell`'s authenticated tree (see `AppShell.tsx`), so `/login`, the
 * public RSVP portal, and the pre-provisioning loading states never render this and keep
 * `index.html`'s static title — nothing to reset there. Renders nothing itself.
 */
export function DocumentTitle() {
  const { data: event } = useEvent();

  useEffect(() => {
    document.title = event ? `${event.boy_name}'s Bar Mitzvah Planner` : DEFAULT_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [event]);

  return null;
}
