import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'plum' | 'gold' | 'neutral';

interface StatTileProps {
  label: string;
  /** The headline figure. A `ReactNode` rather than a bare number/string so a caller can compose
   *  it from `<Money>`, `formatNumber`, or a countdown string without this component knowing
   *  which. */
  value: ReactNode;
  subLabel?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
}

const toneStyles: Record<Tone, string> = {
  plum: 'bg-plum-50 text-plum-700',
  gold: 'bg-gold-50 text-gold-700',
  neutral: 'bg-canvas text-text-muted',
};

/**
 * The dashboard's headline number card — "58 days to go", "£12,450 spent", "26 of 50 RSVPed" —
 * label on top, the figure in Fraunces (the display serif, set via `font-display`) so it reads
 * as a number worth noticing rather than another line of Inter body text.
 */
export function StatTile({ label, value, subLabel, icon: Icon, tone = 'neutral', className }: StatTileProps) {
  return (
    <div className={cn('rounded-lg border border-separator bg-surface p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium uppercase tracking-[.04em] text-text-muted">{label}</p>
        {Icon && (
          <span aria-hidden="true" className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full', toneStyles[tone])}>
            <Icon size={14} />
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate font-display text-3xl leading-tight tabular-nums text-text-primary">{value}</p>
      {subLabel && <p className="mt-1 text-xs text-text-muted">{subLabel}</p>}
    </div>
  );
}
