import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

type Size = 'sm' | 'md' | 'lg';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  /**
   * Required. An icon button has no text, so this is its entire accessible name — without it a
   * screen reader announces nothing but "button".
   */
  label: string;
}

/*
  Phones get 44px whatever `size` asks for.

  WCAG 2.5.5 and the Apple HIG both put the touch-target floor at 44px, and this app is installed
  to the home screen with zoom LOCKED — a target smaller than that is smaller than that forever,
  with no pinch-out to rescue it. The visual box at rest does not change; what grows is the
  pressable area and the press highlight, which is the right way round on a touch device. From
  `sm:` up, a pointer is precise and the compact sizes come back.

  Written in PIXELS, not `h-11`: tokens.css sets `html { font-size: var(--text-base) }` — 14px —
  so the root em is 14px and `h-11` (2.75rem) renders at 38.5px here, not 44. This is exactly the
  bug the CRM's own IconButton shipped and its pixel harness caught at 39×39 on a phone viewport.
*/
const sizeStyles: Record<Size, string> = {
  sm: 'h-[44px] w-[44px] sm:h-7 sm:w-7',
  md: 'h-[44px] w-[44px] sm:h-9 sm:w-9',
  lg: 'h-[44px] w-[44px] sm:h-10 sm:w-10',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', label, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        aria-label={label}
        className={cn(
          'inline-flex items-center justify-center rounded-md text-text-muted transition-colors duration-150',
          'hover:bg-canvas hover:text-text-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400',
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

IconButton.displayName = 'IconButton';
