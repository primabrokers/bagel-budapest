import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutGrid, Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useNotifications } from '../../hooks/useNotifications';
import { QuickAddSheet } from '../QuickAddSheet';
import { NAV_ENTRIES, isNavPathActive, type NavEntry } from './navModel';

const tabClasses =
  'flex min-h-[48px] flex-1 flex-col items-center justify-start gap-0.5 pb-1 pt-2 text-2xs font-semibold transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-plum-400';

function TabLink({ entry, active }: { entry: NavEntry; active: boolean }) {
  const Icon = entry.icon;
  return (
    <NavLink
      to={entry.path}
      end={entry.path === '/'}
      className={cn(tabClasses, active ? 'text-plum-700' : 'text-text-muted')}
    >
      <Icon size={20} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
      {entry.label === 'Dashboard' ? 'Home' : entry.label}
    </NavLink>
  );
}

/**
 * Bottom app-style tab bar for phones/tablets (`lg:hidden` — `Sidebar` takes over at `lg`). Per
 * the brief: Home/Dashboard, Guests, a raised centre FAB (global quick-add), Budget, More. Every
 * destination it links to is read from `NAV_ENTRIES` — this file declares none of its own, so it
 * cannot drift from `Sidebar`/`MobileMoreSheet` the way three independently-maintained nav lists
 * once did in the CRM this app is modelled on.
 */
export function MobileTabBar({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const location = useLocation();
  const byKey = (key: string) => NAV_ENTRIES.find((e) => e.key === key)!;
  const dashboard = byKey('dashboard');
  const guests = byKey('guests');
  const budget = byKey('budget');
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // `MobileMoreSheet` lists every nav entry individually (so the Notifications tile there already
  // carries its own context), but "More" itself is just one tab — a small dot is the phone-sized
  // version of the sidebar's own unread count, enough to say "something in here wants attention"
  // without a number the tab is too small to show cleanly.
  const { unreadNotifications } = useNotifications();
  const hasUnread = unreadNotifications.length > 0;

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-separator bg-surface px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <TabLink entry={dashboard} active={!moreOpen && isNavPathActive(location.pathname, dashboard.path)} />
        <TabLink entry={guests} active={!moreOpen && isNavPathActive(location.pathname, guests.path)} />

        {/* Raised centre FAB — opens the quick-add sheet, it does not navigate. */}
        <div className="flex flex-1 flex-col items-center justify-start pt-1.5">
          <button
            type="button"
            onClick={() => setQuickAddOpen(true)}
            aria-label="Quick add"
            className="flex h-[46px] w-[46px] -translate-y-2 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-500 text-plum-900 shadow-md transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400 focus-visible:ring-offset-2"
          >
            <Plus size={22} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>

        <TabLink entry={budget} active={!moreOpen && isNavPathActive(location.pathname, budget.path)} />

        <button
          type="button"
          onClick={onMore}
          aria-expanded={moreOpen}
          className={cn(
            'relative flex min-h-[48px] flex-1 flex-col items-center justify-start gap-0.5 pb-1 pt-2 text-2xs font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-plum-400',
            moreOpen ? 'text-plum-700' : 'text-text-muted',
          )}
        >
          <span className="relative">
            <LayoutGrid size={20} strokeWidth={moreOpen ? 2.3 : 1.9} aria-hidden="true" />
            {hasUnread && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger-fg ring-2 ring-surface"
              />
            )}
          </span>
          More
          {hasUnread && <span className="sr-only"> — unread notifications</span>}
        </button>
      </nav>

      <QuickAddSheet open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </>
  );
}
