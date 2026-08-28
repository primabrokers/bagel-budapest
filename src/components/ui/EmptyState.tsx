import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  title: string;
  hint?: ReactNode;
  icon?: LucideIcon;
  /** A slot, not a callback — covers "Add a guest", "Clear filters" and anything not yet needed. */
  action?: ReactNode;
  /** Tighter padding, for an empty state inside a card or a table cell rather than a whole page. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({ title, hint, icon: Icon, action, compact = false, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-dashed border-separator bg-surface text-center',
        compact ? 'px-4 py-6' : 'px-6 py-12',
        className,
      )}
    >
      {Icon && (
        <span
          aria-hidden="true"
          className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-canvas text-text-muted"
        >
          <Icon size={18} />
        </span>
      )}
      <p className="text-sm font-medium text-text-secondary">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-prose text-xs text-text-muted">{hint}</p>}
      {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
