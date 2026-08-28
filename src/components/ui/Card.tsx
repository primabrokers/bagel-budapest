import { cn } from '../../lib/cn';

type Padding = 'none' | 'sm' | 'md' | 'lg';
type Shadow = 'none' | 'xs' | 'sm' | 'md';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: Padding | boolean;
  shadow?: Shadow;
  /** Optional DOM id — lets a card be a scroll/deep-link anchor. */
  id?: string;
}

const paddingMap: Record<Padding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

const shadowMap: Record<Shadow, string> = {
  none: '',
  xs: 'shadow-xs',
  sm: 'shadow-sm',
  md: 'shadow-md',
};

export function Card({ children, className, padding = 'lg', shadow = 'none', id }: CardProps) {
  const pad =
    typeof padding === 'boolean'
      ? padding
        ? paddingMap.lg
        : paddingMap.none
      : paddingMap[padding];

  return (
    <div
      id={id}
      className={cn(
        'rounded-lg border border-separator bg-surface',
        pad,
        shadowMap[shadow],
        className,
      )}
    >
      {children}
    </div>
  );
}
