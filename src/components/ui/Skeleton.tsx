import { cn } from '../../lib/cn';

/**
 * A pulsing placeholder block for content whose SHAPE is already known (a stat tile, a table
 * row, a card) — it reserves the space, so nothing jumps when the data lands. `aria-hidden`
 * because a pulsing block announces nothing useful to a screen reader; pair it with `aria-busy`
 * on the region it stands in, or a visible loading label, so the wait is actually announced.
 * Respects `prefers-reduced-motion` for free — see the reduced-motion block in globals.css,
 * which collapses `animate-pulse`'s duration to near-zero rather than removing the cue outright.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-canvas', className)} />;
}

/** Placeholder lines of text — the commonest composition, so it is spelled once. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={cn('h-3 animate-pulse rounded bg-canvas', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}
