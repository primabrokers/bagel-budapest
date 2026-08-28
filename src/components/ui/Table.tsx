import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { activateOnKey } from '../../lib/activate';

/**
 * A thin semantic wrapper for tabular data — consistent header/row/cell styling, a phone
 * column-drop convention, and a keyboard path for clickable rows. Not a data-grid: no sorting,
 * resizing or virtualisation live here, and nothing here decides which columns exist.
 *
 * At 390px a table either scrolls sideways or squashes every column to nothing, and this app is
 * installed with zoom locked, so there is no pinching out of either. `hideBelow` drops whole
 * columns rather than shrinking them, and `restate` puts what a dropped column held back on
 * screen as a phone-only sub-line — dropping a column must never mean dropping the data itself.
 */

/** Tailwind cannot build a class name at runtime, so the breakpoints are spelled out. */
const HIDE_BELOW = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
} as const;

/** The restatement's own visibility — shown below the breakpoint, gone once the columns return. */
const RESTATE_BELOW = {
  sm: 'sm:hidden',
  md: 'md:hidden',
  lg: 'lg:hidden',
  xl: 'xl:hidden',
} as const;

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /**
   * Drop this column below the given breakpoint. Wide tables drop columns; they never shrink
   * them — at 390px six columns of 60px are six columns of nothing.
   */
  hideBelow?: keyof typeof HIDE_BELOW;
  /** Right-align, for money and counts. */
  numeric?: boolean;
  /** Extra classes on the cell, e.g. `max-w-[180px] truncate`. */
  className?: string;
}

interface TableProps<Row> {
  /**
   * The table's accessible name. Required: a table with no name is announced as "table", and a
   * screen with two of them gives no way to tell which is which.
   */
  label: string;
  columns: TableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Makes rows activatable by click, Enter and Space. */
  onRowClick?: (row: Row) => void;
  /**
   * Phone-only sub-line inside the first cell, restating whatever `hideBelow` columns hold.
   * Without it, dropping a column drops the data — this is what makes the drop lossless.
   */
  restate?: (row: Row) => ReactNode;
  /**
   * Where the restatement stops showing. Set it to the LARGEST `hideBelow` among the columns it
   * restates — a table dropping columns at `lg` with a restatement that vanishes at `sm` loses
   * the data everywhere in between. Defaults to `sm`.
   */
  restateBelow?: keyof typeof RESTATE_BELOW;
  loading?: boolean;
  loadingLabel?: string;
  /** Shown in place of rows when there are none. */
  empty?: ReactNode;
  /** Minimum width before the wrapper scrolls. Set it to the width the columns need to read. */
  minWidth?: string;
  /** Marks a row as selected — the current record in a master-detail pane. */
  isSelected?: (row: Row) => boolean;
  /** Extra classes per row — an overdue row's tint, the current record's highlight. State, not layout. */
  rowClassName?: (row: Row) => string | undefined;
  className?: string;
}

export function Table<Row>({
  label,
  columns,
  rows,
  rowKey,
  onRowClick,
  restate,
  restateBelow = 'sm',
  loading = false,
  loadingLabel = 'Loading…',
  empty,
  minWidth,
  isSelected,
  rowClassName,
  className,
}: TableProps<Row>) {
  const span = columns.length;

  return (
    // The scroll lives on the wrapper, not the table, so a sticky header keeps working and the
    // page itself never gains a horizontal scrollbar.
    <div className={cn('overflow-x-auto', className)}>
      <table
        aria-label={label}
        className="w-full border-collapse text-sm"
        style={minWidth ? { minWidth } : undefined}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'sticky top-0 z-10 border-b border-separator bg-canvas px-2.5 py-2 text-2xs font-semibold uppercase tracking-[.05em] text-text-muted',
                  col.numeric ? 'text-right' : 'text-left',
                  col.hideBelow && HIDE_BELOW[col.hideBelow],
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={span} className="px-2.5 py-10 text-center text-sm text-text-muted">
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                  {loadingLabel}
                </span>
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={span} className="px-2.5 py-10 text-center">
                {empty ?? <span className="text-sm text-text-muted">Nothing to show.</span>}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const selected = isSelected?.(row) ?? false;
              return (
                <tr
                  key={rowKey(row)}
                  // A <tr> cannot be a <button> and frequently contains its own, so this is the
                  // sanctioned role="button" + activateOnKey pairing — activateOnKey's
                  // target===currentTarget guard is what stops Enter on a nested button from
                  // also firing the row's own action.
                  {...(onRowClick && {
                    role: 'button',
                    tabIndex: 0,
                    onClick: () => onRowClick(row),
                    onKeyDown: activateOnKey(() => onRowClick(row)),
                  })}
                  className={cn(
                    'border-t border-separator-soft transition-colors',
                    onRowClick &&
                      'cursor-pointer hover:bg-hover focus-visible:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-plum-400',
                    selected && 'bg-plum-50',
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-2.5 py-2.5 align-top',
                        col.numeric && 'text-right tabular-nums',
                        col.hideBelow && HIDE_BELOW[col.hideBelow],
                        col.className,
                      )}
                    >
                      {col.cell(row)}
                      {/* The restatement rides in the first cell and disappears the moment the
                          dropped columns come back. */}
                      {i === 0 && restate && (
                        <div className={cn('mt-0.5 text-2xs text-text-muted', RESTATE_BELOW[restateBelow])}>{restate(row)}</div>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
