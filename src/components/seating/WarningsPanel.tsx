import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../../lib/cn';
import { EmptyState } from '../ui/EmptyState';
import type { SeatingWarning, WarningSeverity } from '../../lib/seating/warnings';

interface WarningsPanelProps {
  warnings: SeatingWarning[];
  /** Jump to the relevant table — opens `TableDetailSheet` for it. Omitted (no button shown) for
   *  a warning that carries no `objectId`. */
  onJumpToObject?: (objectId: string) => void;
  /** Jump to the relevant guest — switches to the Guest list view and highlights them. Omitted
   *  for a warning that carries no `guestIds`. */
  onJumpToGuest?: (guestId: string) => void;
  className?: string;
}

const SEVERITY_META: Record<WarningSeverity, { icon: typeof AlertTriangle; badgeClass: string; label: string }> = {
  error: { icon: AlertTriangle, badgeClass: 'bg-danger-bg text-danger-text', label: 'Needs fixing' },
  warning: { icon: AlertOctagon, badgeClass: 'bg-warning-bg text-warning-text', label: 'Worth checking' },
  info: { icon: Info, badgeClass: 'bg-info-bg text-info-text', label: 'For your info' },
};

/** Renders `lib/seating/warnings.ts`'s `computeSeatingWarnings()` output — over-capacity tables,
 *  attending guests with no seat, split households, and preference violations — each with a jump
 *  action to the table or guest it concerns. */
export function WarningsPanel({ warnings, onJumpToObject, onJumpToGuest, className }: WarningsPanelProps) {
  if (warnings.length === 0) {
    return <EmptyState compact title="No warnings" hint="Nothing needs attention on this plan right now." className={className} />;
  }

  return (
    <ul className={cn('flex flex-col divide-y divide-separator-soft', className)}>
      {warnings.map((warning) => {
        const meta = SEVERITY_META[warning.severity];
        const Icon = meta.icon;
        return (
          <li key={warning.id} className="flex items-start gap-3 py-3">
            <span aria-hidden="true" className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full', meta.badgeClass)}>
              <Icon size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-[.04em] text-text-faint">{meta.label}</p>
              <p className="mt-0.5 text-sm text-text-primary">{warning.message}</p>
              {(warning.objectId || warning.guestIds?.length) && (
                <div className="mt-1.5 flex flex-wrap gap-3">
                  {warning.objectId && onJumpToObject && (
                    <button
                      type="button"
                      onClick={() => onJumpToObject(warning.objectId!)}
                      className="text-xs font-medium text-plum-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                    >
                      View table
                    </button>
                  )}
                  {warning.guestIds && warning.guestIds.length > 0 && onJumpToGuest && (
                    <button
                      type="button"
                      onClick={() => onJumpToGuest(warning.guestIds![0])}
                      className="text-xs font-medium text-plum-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                    >
                      View guest
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
