import { useMemo } from 'react';
import { Badge } from '../ui/Badge';
import { Table, type TableColumn } from '../ui/Table';
import { floorObjectLabel } from '../../lib/seating/tableGeometry';
import { guestDisplayName } from '../../lib/seating/warnings';
import type { HouseholdWithGuests } from '../../data/guests/types';
import type { FloorObjectRow, SeatAssignmentRow } from '../../data/seating/types';

interface GuestListViewProps {
  households: HouseholdWithGuests[];
  assignmentsByGuest: Map<string, SeatAssignmentRow>;
  objectsById: Map<string, FloorObjectRow>;
  onJumpToObject?: (objectId: string) => void;
  className?: string;
}

interface Row {
  guestId: string;
  name: string;
  householdName: string;
  isVip: boolean;
  tableLabel: string | null;
  objectId: string | null;
  seatIndex: number | null;
}

/**
 * A plain list of every guest and their current seat assignment (or "Unseated") — a full-roster
 * read rather than the spatial room view, for scanning or a final sanity check before printing.
 * Built on the shared `Table` component (phone column-drop + restatement) rather than a
 * hand-rolled `<table>`.
 */
export function GuestListView({ households, assignmentsByGuest, objectsById, onJumpToObject, className }: GuestListViewProps) {
  const rows = useMemo(() => {
    const list: Row[] = [];
    for (const household of households) {
      for (const guest of household.guests) {
        const assignment = assignmentsByGuest.get(guest.id);
        const object = assignment ? objectsById.get(assignment.object_id) : undefined;
        list.push({
          guestId: guest.id,
          name: guestDisplayName(guest),
          householdName: household.name,
          isVip: guest.is_vip,
          tableLabel: object ? floorObjectLabel(object) : null,
          objectId: assignment?.object_id ?? null,
          seatIndex: assignment?.seat_index ?? null,
        });
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [households, assignmentsByGuest, objectsById]);

  const columns: TableColumn<Row>[] = [
    {
      key: 'guest',
      header: 'Guest',
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-text-primary">{row.name}</span>
          {row.isVip && <Badge variant="gold">VIP</Badge>}
        </span>
      ),
    },
    { key: 'household', header: 'Household', cell: (row) => row.householdName, hideBelow: 'sm' },
    {
      key: 'table',
      header: 'Table',
      cell: (row) =>
        row.tableLabel ? (
          row.objectId && onJumpToObject ? (
            <button
              type="button"
              onClick={() => onJumpToObject(row.objectId!)}
              className="text-plum-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
            >
              {row.tableLabel}
            </button>
          ) : (
            <span className="text-text-primary">{row.tableLabel}</span>
          )
        ) : (
          <span className="text-text-muted">Unseated</span>
        ),
    },
    {
      key: 'seat',
      header: 'Seat',
      cell: (row) => (row.seatIndex != null ? row.seatIndex + 1 : '—'),
      numeric: true,
      hideBelow: 'sm',
    },
  ];

  return (
    <Table
      label="Guest seating list"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.guestId}
      restate={(row) => `${row.householdName} · Seat ${row.seatIndex != null ? row.seatIndex + 1 : '—'}`}
      empty={<span className="text-sm text-text-muted">No guests yet.</span>}
      className={className}
    />
  );
}
