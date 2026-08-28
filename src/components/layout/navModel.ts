import {
  Armchair,
  Bell,
  BookUser,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Handshake,
  Home,
  Lightbulb,
  Mail,
  PoundSterling,
  Settings,
  StickyNote,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * THE NAV RAIL, DECLARED ONCE.
 *
 * Pure data — no React import, no `lib/supabase` import — so `navModel.test.ts` can check it
 * (uniqueness, well-formedness) with no credentials and no DOM. `Sidebar`, `MobileTabBar` and
 * `MobileMoreSheet` all read from THIS array rather than keeping their own list: the CRM this
 * app is modelled on shipped exactly the bug three independently-maintained nav lists invite —
 * a module present on the desktop rail and silently missing from the phone launcher — and the
 * fix there was to collapse to one array. Doing it that way from day one here is cheaper than
 * fixing the same drift later.
 *
 * This app has no permission gating (a family planning one Bar Mitzvah, not a staff roster with
 * modules some people can't see), so unlike the CRM's own `navModel.ts` there is no gate/badge
 * projection to resolve — every entry is always shown, to every signed-in member.
 */
export interface NavEntry {
  /** Stable identity, independent of the label and the path. */
  key: string;
  label: string;
  /** Absolute route path, e.g. '/guests'. The dashboard's is '/'. */
  path: string;
  icon: LucideIcon;
}

export const NAV_ENTRIES: NavEntry[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/', icon: Home },
  { key: 'guests', label: 'Guests', path: '/guests', icon: Users },
  { key: 'invitations', label: 'Invitations', path: '/invitations', icon: Mail },
  { key: 'rsvp-tracker', label: 'RSVP tracker', path: '/rsvp-tracker', icon: ClipboardCheck },
  { key: 'seating', label: 'Seating', path: '/seating', icon: Armchair },
  { key: 'vendors', label: 'Vendors', path: '/vendors', icon: Handshake },
  { key: 'budget', label: 'Budget', path: '/budget', icon: PoundSterling },
  { key: 'menu', label: 'Menu', path: '/menu', icon: UtensilsCrossed },
  { key: 'tasks', label: 'Tasks', path: '/tasks', icon: CheckSquare },
  { key: 'ideas', label: 'Ideas', path: '/ideas', icon: Lightbulb },
  { key: 'documents', label: 'Documents', path: '/documents', icon: FileText },
  { key: 'run-sheet', label: 'Run sheet', path: '/run-sheet', icon: ClipboardList },
  { key: 'contacts', label: 'Contacts', path: '/contacts', icon: BookUser },
  { key: 'notes', label: 'Notes', path: '/notes', icon: StickyNote },
  { key: 'notifications', label: 'Notifications', path: '/notifications', icon: Bell },
  { key: 'settings', label: 'Settings', path: '/settings', icon: Settings },
];

/**
 * The phone tab bar's fixed slots — Home, Guests, a raised centre FAB (quick-add; no nav entry
 * of its own — it opens a sheet, Stage 10, rather than navigating), Budget, and More (opens
 * `MobileMoreSheet`, which lists every entry above). Declared here, next to `NAV_ENTRIES`
 * rather than hardcoded inside `MobileTabBar`, so a future reshuffle of the phone's five slots
 * has one place to change and a comment explaining why those three were picked.
 */
export const MOBILE_TAB_KEYS = ['dashboard', 'guests', 'budget'] as const;

/**
 * Is `to` the destination currently open? Segment-boundary matching, not a bare
 * `pathname.startsWith(to)` — that would match `/guests` against `/guestsomething`, and treat
 * every path under a destination as being that SAME destination (this app has no nested pages
 * yet, but a future one, e.g. a guest detail sheet route, must still light "Guests"). The
 * dashboard's path is `/`, which needs its own case: every path starts with `/`, so the general
 * "starts with `${to}/`" rule would light the Dashboard tab on every single route.
 */
export function isNavPathActive(pathname: string, to: string): boolean {
  if (pathname === to) return true;
  if (to === '/') return false;
  return pathname.startsWith(`${to}/`);
}
