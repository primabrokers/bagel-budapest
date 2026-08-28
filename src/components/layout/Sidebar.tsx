import { NavLink, useLocation } from 'react-router-dom';
import { LogOut, Search } from 'lucide-react';
import { cn } from '../../lib/cn';
import { supabase } from '../../lib/supabase';
import { openCommandPalette } from '../../hooks/useCommandPalette';
import { useNotifications } from '../../hooks/useNotifications';
import { NAV_ENTRIES, isNavPathActive } from './navModel';

/** Desktop vertical nav — `hidden lg:flex` is applied by the caller (`AppShell`), not here, so
 *  this component stays a plain list with no viewport logic of its own. */
export function Sidebar() {
  const location = useLocation();
  const { unreadNotifications } = useNotifications();
  const unreadCount = unreadNotifications.length;

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-separator bg-surface py-4">
      <div className="mb-3 flex items-center gap-2.5 px-4">
        <span
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-plum-700 font-display text-sm font-semibold text-text-inverse"
        >
          D
        </span>
        <span className="truncate font-display text-base font-semibold text-plum-800">
          Bar Mitzvah Planner
        </span>
      </div>

      <div className="mb-3 px-2">
        <button
          type="button"
          onClick={openCommandPalette}
          className="flex w-full items-center gap-2 rounded-md border border-separator-control bg-canvas px-2.5 py-2 text-sm text-text-muted transition-colors hover:bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
        >
          <Search size={15} aria-hidden="true" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border border-separator-control bg-surface px-1.5 py-0.5 text-2xs font-medium text-text-faint">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav aria-label="Primary" className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {NAV_ENTRIES.map((entry) => {
          const Icon = entry.icon;
          const active = isNavPathActive(location.pathname, entry.path);
          const badge = entry.key === 'notifications' && unreadCount > 0 ? unreadCount : null;
          return (
            <NavLink
              key={entry.key}
              to={entry.path}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400',
                active
                  ? 'bg-plum-50 text-plum-800'
                  : 'text-text-secondary hover:bg-hover hover:text-text-primary',
              )}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              {badge != null && (
                <span
                  aria-label={`${badge} unread`}
                  className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-danger-bg px-1 text-2xs font-semibold tabular-nums text-danger-text"
                >
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-2 border-t border-separator px-2 pt-2">
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
        >
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
