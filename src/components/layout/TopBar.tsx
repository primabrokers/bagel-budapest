import { Search } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { openCommandPalette } from '../../hooks/useCommandPalette';

/**
 * A thin brand row for phones only (`lg:hidden`) — below `lg`, `Sidebar` is not on screen at all,
 * so nothing else on the page carries the app's identity. At `lg` and up the sidebar's own
 * header takes over and this disappears rather than doubling it up. Also the phone's own entry
 * point into `CommandPalette` — a phone has no ⌘K to discover, so the search icon here is how a
 * family member on a phone finds out global search exists at all.
 */
export function TopBar() {
  return (
    <header className="flex min-h-[52px] shrink-0 items-center gap-2.5 border-b border-separator bg-surface px-4 pt-[env(safe-area-inset-top)] lg:hidden">
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-plum-700 font-display text-sm font-semibold text-text-inverse"
      >
        D
      </span>
      <span className="truncate font-display text-base font-semibold text-plum-800">
        Bar Mitzvah Planner
      </span>
      <IconButton label="Search" size="sm" onClick={openCommandPalette} className="ml-auto">
        <Search size={17} aria-hidden="true" />
      </IconButton>
    </header>
  );
}
