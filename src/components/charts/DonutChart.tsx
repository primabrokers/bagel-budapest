import type { ReactNode } from 'react';
import { describeArc } from '../../lib/chartGeometry';
import { formatCurrency } from '../../lib/format';
import { cn } from '../../lib/cn';

export interface DonutSegment {
  label: string;
  value: number;
  /** A `text-*` Tailwind class — the arc strokes with `currentColor`. See
   *  `components/charts/palette.ts`'s `chartColourFor` for this app's stable categorical
   *  assignment (colour keyed to the entity, not to sort order). Falls back to a neutral grey. */
  colourClass?: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  /** Short text (or a `<Money>`/`StatTile`-style figure) centred inside the ring — the total. */
  centreLabel?: ReactNode;
  centreSubLabel?: ReactNode;
  formatValue?: (value: number) => string;
  /** The chart's accessible name — required, the same way `Table`/`Menu` require one; a chart
   *  with no name is announced as nothing more than "image". */
  label: string;
  className?: string;
}

/** Angular gap between adjacent segments, in degrees — the SVG-donut equivalent of the "2px
 *  surface gap" mark spec: touching fills read as distinct because of the gap, not a stroke. */
const GAP_DEGREES = 2;
const DEFAULT_COLOUR = 'text-separator-strong';

/** The arc strokes with a `text-*` class (`stroke="currentColor"`); a legend swatch is a filled
 *  dot, so it wants the matching `bg-*` class instead. Both variants already exist as literal
 *  strings in `components/charts/palette.ts`, so this string-swap is safe — Tailwind's content
 *  scanner has already generated whichever utility it resolves to; nothing is built purely at
 *  runtime that Tailwind never saw in source. */
function toFillClass(colourClass: string): string {
  return colourClass.startsWith('text-') ? colourClass.replace(/^text-/, 'bg-') : colourClass;
}

/**
 * A dependency-free SVG donut — each segment is a stroked ring arc (`describeArc` + a thick
 * `stroke-width`, `fill="none"`), the standard technique for a hole-in-the-middle chart that
 * needs only one radius. Used for "spend by category" on `BudgetPage` and its dashboard widget.
 *
 * Every value is also listed in the legend as real text — colour is never the only way to read
 * a segment, both because two of this app's five palette slots sit in the "tell them apart only
 * with a secondary encoding" band (see palette.ts) and because that is simply the right default
 * regardless.
 */
export function DonutChart({
  segments,
  size = 168,
  thickness = 22,
  centreLabel,
  centreSubLabel,
  formatValue = formatCurrency,
  label,
  className,
}: DonutChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - thickness) / 2;

  const positive = segments.filter((s) => s.value > 0);
  const total = positive.reduce((sum, s) => sum + s.value, 0);

  let cursor = 0;
  const arcs = positive.map((segment) => {
    const sweep = total > 0 ? (segment.value / total) * 360 : 0;
    const gap = positive.length > 1 ? GAP_DEGREES : 0;
    const start = cursor + gap / 2;
    const end = Math.max(start, cursor + sweep - gap / 2);
    cursor += sweep;
    return { ...segment, d: describeArc(cx, cy, radius, start, end) };
  });

  return (
    <div className={cn('flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6', className)}>
      <div className="relative shrink-0">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-40 sm:w-44" role="img" aria-label={label}>
          {total <= 0 ? (
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={thickness}
              className="text-separator-soft"
            />
          ) : (
            arcs.map((arc) => (
              <path
                key={arc.label}
                d={arc.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={thickness}
                strokeLinecap="round"
                className={arc.colourClass ?? DEFAULT_COLOUR}
              />
            ))
          )}
        </svg>
        {(centreLabel || centreSubLabel) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
            {centreLabel && (
              <span className="truncate text-lg font-semibold tabular-nums text-text-primary">{centreLabel}</span>
            )}
            {centreSubLabel && <span className="truncate text-2xs text-text-muted">{centreSubLabel}</span>}
          </div>
        )}
      </div>

      <ul className="flex w-full min-w-0 flex-col gap-1.5 text-sm">
        {positive.length === 0 ? (
          <li className="text-text-muted">No spend recorded yet.</li>
        ) : (
          positive.map((segment) => (
            <li key={segment.label} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn('h-2.5 w-2.5 shrink-0 rounded-full', toFillClass(segment.colourClass ?? DEFAULT_COLOUR))}
                />
                <span className="truncate text-text-secondary">{segment.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-text-primary">{formatValue(segment.value)}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
