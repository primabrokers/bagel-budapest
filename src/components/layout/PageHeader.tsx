import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned action buttons (a "New guest" button, a menu). Wraps under the title on a
   *  narrow screen rather than overflowing it. */
  actions?: ReactNode;
  className?: string;
}

/** Every page's title row — one place so every screen's heading looks and sizes the same. */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold text-text-primary">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
