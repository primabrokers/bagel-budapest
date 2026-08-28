import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-plum-700 text-text-inverse border border-plum-700 hover:bg-plum-800 hover:border-plum-800',
  secondary:
    'bg-surface text-text-primary border border-separator hover:bg-hover',
  ghost:
    'bg-transparent text-text-secondary border border-transparent hover:bg-hover hover:text-text-primary',
  danger:
    'bg-danger-bg text-danger-text border border-danger-border hover:bg-danger-fg hover:text-text-inverse hover:border-danger-fg',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-4 text-base gap-2',
  lg: 'h-10 px-5 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // whitespace-nowrap + shrink-0: the size variants set a FIXED height, so a label
          // allowed to wrap would spill out of its own pill and over its icon on a 390px
          // screen. Buttons keep their intrinsic width and the row they sit in wraps instead.
          'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          'disabled:opacity-50 disabled:pointer-events-none',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
