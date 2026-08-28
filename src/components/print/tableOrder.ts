import { floorObjectLabel } from '../../lib/seating/tableGeometry';
import type { FloorObjectRow } from '../../data/seating/types';

/**
 * Table number ascending, unnumbered tables last (alphabetical by their own display label) — the
 * one sort every seating-plan-derived print route (`SeatingPlanPrintPage`, `CatererPrintPage`,
 * `PlaceCardsPrintPage`, `TableCardsPrintPage`) uses, so the same plan always lists its tables in
 * the same order across every sheet printed from it. Lives here rather than in `lib/seating/`
 * (off-limits to this pass — see the print/PDF follow-up's own file-scope rules) since it is
 * print-route-specific ordering, not seating-domain logic.
 */
export function compareTableOrder(
  a: Pick<FloorObjectRow, 'label' | 'table_number' | 'kind'>,
  b: Pick<FloorObjectRow, 'label' | 'table_number' | 'kind'>,
): number {
  if (a.table_number != null && b.table_number != null) return a.table_number - b.table_number;
  if (a.table_number != null) return -1;
  if (b.table_number != null) return 1;
  return floorObjectLabel(a).localeCompare(floorObjectLabel(b));
}
