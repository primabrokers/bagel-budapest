import { niceTicks } from '../../lib/chartGeometry';
import { formatNumber } from '../../lib/format';
import { cn } from '../../lib/cn';

export interface HBarGroupSeries {
  key: string;
  label: string;
  /** A `bg-*` Tailwind class — bars are filled rects, so (unlike `DonutChart`'s stroked arcs)
   *  there's no text/bg swap to do; the caller's colour goes straight on the `<rect>`. */
  colourClass: string;
}

export interface HBarGroupRow {
  key: string;
  label: string;
  /** seriesKey -> value. A series missing from a row reads as 0. */
  values: Record<string, number>;
}

interface HBarGroupProps {
  series: HBarGroupSeries[];
  rows: HBarGroupRow[];
  /** Formats both the shared axis ticks and each row's restated values. Defaults to a whole-pound
   *  `£`-prefixed figure — an axis tick doesn't want `formatCurrency`'s pence. */
  formatValue?: (value: number) => string;
  /** The chart's accessible name, read on the wrapping region — required, the same way
   *  `Table`/`Menu` require one. */
  label: string;
  className?: string;
}

/** <=24px per the dataviz mark spec, well under it — three series stack in one row's height at
 *  390px without crowding the row label beside them. */
const BAR_HEIGHT = 9;
const BAR_GAP = 3;
const LABEL_WIDTH = 'w-24 sm:w-32';

function defaultFormatValue(value: number): string {
  return `£${formatNumber(Math.round(value))}`;
}

/**
 * A dependency-free SVG grouped horizontal bar chart — e.g. budgeted vs agreed vs paid, per
 * category or per vendor. Ticks come from `niceTicks` so the shared axis lands on round numbers
 * rather than the raw data's own maximum.
 *
 * Each row's bar TRACK is a decorative `<svg>` (`aria-hidden`, `preserveAspectRatio="none"` so
 * its 0–100 viewBox width maps to whatever the flex layout gives it) — the actual numbers are
 * real DOM text underneath, so a screen reader (and a sighted reader who would rather not
 * eyeball bar lengths) gets the figures regardless.
 */
export function HBarGroup({ series, rows, formatValue = defaultFormatValue, label, className }: HBarGroupProps) {
  const rawMax = rows.reduce((max, row) => {
    const rowMax = series.reduce((m, s) => Math.max(m, row.values[s.key] ?? 0), 0);
    return Math.max(max, rowMax);
  }, 0);
  const ticks = niceTicks(0, rawMax > 0 ? rawMax : 1, 4);
  const domainMax = ticks[ticks.length - 1] || 1;
  const trackHeight = series.length * BAR_HEIGHT + Math.max(series.length - 1, 0) * BAR_GAP;

  return (
    <div className={cn('flex flex-col gap-3', className)} aria-label={label} role="group">
      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-full', s.colourClass)} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing to show yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <span className={cn('shrink-0 truncate text-xs text-text-secondary', LABEL_WIDTH)}>{row.label}</span>
                <svg
                  viewBox={`0 0 100 ${trackHeight}`}
                  preserveAspectRatio="none"
                  style={{ height: trackHeight }}
                  className="w-full min-w-0"
                  aria-hidden="true"
                >
                  {series.map((s, i) => {
                    const value = row.values[s.key] ?? 0;
                    const width = domainMax > 0 ? Math.min((value / domainMax) * 100, 100) : 0;
                    return (
                      <rect
                        key={s.key}
                        x={0}
                        y={i * (BAR_HEIGHT + BAR_GAP)}
                        width={width}
                        height={BAR_HEIGHT}
                        rx={2}
                        className={s.colourClass}
                      />
                    );
                  })}
                </svg>
              </div>
              {/* The figures themselves, as real text — a bar's length is never the only way to
                  read its value. */}
              <div className="flex flex-wrap gap-x-3 text-2xs text-text-muted">
                {series.map((s) => (
                  <span key={s.key} className="tabular-nums">
                    {s.label} {formatValue(row.values[s.key] ?? 0)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-center gap-2.5">
          <span className={cn('shrink-0', LABEL_WIDTH)} aria-hidden="true" />
          <div className="flex min-w-0 flex-1 justify-between text-2xs text-text-muted">
            {ticks.map((tick) => (
              <span key={tick} className="tabular-nums">
                {formatValue(tick)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
