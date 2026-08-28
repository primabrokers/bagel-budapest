import { useNavigate } from 'react-router-dom';
import { LayoutGrid, LogOut } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { supabase } from '../../lib/supabase';
import { NAV_ENTRIES } from './navModel';

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Full-screen-ish launcher for the phone shell — every destination `Sidebar` shows on desktop,
 * as tappable tiles, reading the SAME `NAV_ENTRIES` array. Opened from the tab bar's "More" slot.
 */
export function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  const navigate = useNavigate();

  function go(path: string) {
    onClose();
    navigate(path);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="All pages"
      icon={<LayoutGrid size={16} aria-hidden="true" />}
      anchor="drawer"
      size="md"
    >
      <div className="grid grid-cols-2 gap-2.5">
        {NAV_ENTRIES.map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => go(entry.path)}
              className="flex min-h-[64px] items-center gap-2.5 rounded-lg border border-separator bg-surface p-3 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
            >
              <span
                aria-hidden="true"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-plum-50 text-plum-700"
              >
                <Icon size={16} />
              </span>
              <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                {entry.label}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => {
          onClose();
          void supabase.auth.signOut();
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-separator px-4 py-2.5 text-sm font-semibold text-danger-text transition-colors hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-fg"
      >
        <LogOut size={15} aria-hidden="true" />
        Sign out
      </button>
    </Sheet>
  );
}
