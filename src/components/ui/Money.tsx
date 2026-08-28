import { formatCurrency } from '../../lib/format';
import { cn } from '../../lib/cn';

interface MoneyProps {
  /** The amount in pounds (not pence) — the same unit `formatCurrency` takes everywhere else. */
  value: number;
  className?: string;
  /** `tabular-nums` by default, for a column of amounts to line up on their decimal points. */
  tabular?: boolean;
}

/** A formatted money amount, red-tinted when negative (an overspend, a refund owed). */
export function Money({ value, className, tabular = true }: MoneyProps) {
  return (
    <span
      className={cn(
        tabular && 'tabular-nums',
        value < 0 ? 'text-danger-text' : undefined,
        className,
      )}
    >
      {formatCurrency(value)}
    </span>
  );
}
