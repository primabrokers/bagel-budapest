import type { ReactNode } from 'react';
import { formatCurrency } from '../../lib/format';
import { cn } from '../../lib/cn';

interface ProgressBarProps {
  /** The numerator — e.g. amount paid, guests responded. */
  value: number;
  /** The denominator — e.g. amount agreed, guests invited. */
  max: number;
  /** Shown above the bar, e.g. "Paid". */
  label?: ReactNode;
  /** The line under the bar, e.g. "£12,450 of £20,000 spent". Defaults to a money phrasing —
   *  budget's own use here; a caller with a count-based use (an RSVP "26 of 50 responded") passes
   *  its own. */
  formatValue?: (value: number, max: number) => string;
  /** Fill colour as a `bg-*` class. Ignored (overridden to `bg-danger-fg`) once `value` exceeds
   *  `max` — an overspend is always shown as over, regardless of what colour was asked for. */
  colourClass?: string;
  className?: string;
}

function defaultFormatValue(value: number, max: number): string {
  return `${formatCurrency(value)} of ${formatCurrency(max)}`;
}

/** A single filled progress bar with a label and a real-text value line — "spend so far" on
 *  `BudgetSnapshotWidget`, or (a later stage's business, not this one's) an RSVP-style count. */
export function ProgressBar({
  value,
  max,
  label,
  formatValue = defaultFormatValue,
  colourClass = 'bg-plum-600',
  className,
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 0;
  const pct = safeMax > 0 ? Math.min((value / safeMax) * 100, 100) : 0;
  const overBudget = safeMax > 0 && value > safeMax;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <p className="text-xs font-medium text-text-secondary">{label}</p>}
      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(safeMax)}
        aria-valuetext={formatValue(value, safeMax)}
        aria-label={typeof label === 'string' ? label : undefined}
        className="h-2.5 w-full overflow-hidden rounded-full bg-canvas"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', overBudget ? 'bg-danger-fg' : colourClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={cn('text-xs', overBudget ? 'text-danger-text' : 'text-text-muted')}>{formatValue(value, safeMax)}</p>
    </div>
  );
}
