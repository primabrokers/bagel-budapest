import { cn } from '../../lib/cn';

type Variant =
  | 'plum'
  | 'gold'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted';

interface BadgeProps {
  variant?: Variant;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<Variant, string> = {
  plum:    'bg-plum-50 text-plum-800',
  gold:    'bg-gold-50 text-gold-800',
  info:    'bg-info-bg text-info-text',
  success: 'bg-success-bg text-success-text',
  warning: 'bg-warning-bg text-warning-text',
  danger:  'bg-danger-bg text-danger-text',
  muted:   'bg-canvas text-text-muted',
};

export function Badge({ variant = 'muted', dot, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        variantStyles[variant],
        className,
      )}
    >
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
