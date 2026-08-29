import { useEffect, useMemo, useState } from 'react';
import { Lock, Search, Trash2, Unlock, UserPlus, X } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Badge } from '../ui/Badge';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { EmptyState } from '../ui/EmptyState';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { assignmentsBySlot, floorObjectLabel, isSeatableKind, seatSlots } from '../../lib/seating/tableGeometry';
import { mechitzaObject, type MechitzaAxis } from '../../lib/seating/roomLayout';
import { parseMoneyOrNull } from '../../lib/format';
import { guestDisplayName, type GuestIndexEntry } from '../../lib/seating/warnings';
import {
  assignSeat,
  deleteFloorObject,
  setSeatLocked,
  swapSeatAssignments,
  unassignSeat,
  updateFloorObject,
} from '../../data/seating/mutations';
import type { HouseholdWithGuests } from '../../data/guests/types';
import type { FloorObjectWithAssignments, SeatAssignmentRow } from '../../data/seating/types';

interface DetailFormState {
  label: string;
  table_number: string;
  capacity: string;
  notes: string;
}

function toForm(object: FloorObjectWithAssignments): DetailFormState {
  return {
    label: object.label ?? '',
    table_number: object.table_number != null ? String(object.table_number) : '',
    capacity: object.capacity != null ? String(object.capacity) : '',
    notes: object.notes ?? '',
  };
}

/** A mechitza's own two settings: which way it runs, and where along the room it stands. Both are
 *  read back OUT of its geometry rather than stored separately, so a partition dragged across the
 *  canvas and one typed in here can never disagree about where it is. */
interface MechitzaFormState {
  axis: MechitzaAxis;
  positionM: string;
}

function toMechitzaForm(object: FloorObjectWithAssignments): MechitzaFormState {
  const axis: MechitzaAxis = object.height >= object.width ? 'vertical' : 'horizontal';
  const centreCm = axis === 'vertical' ? object.x : object.y;
  return { axis, positionM: String(Math.round(centreCm) / 100) };
}

interface TableDetailSheetProps {
  open: boolean;
  onClose: () => void;
  /** The floor object this sheet describes. `null` briefly while the sheet is closing. */
  object: FloorObjectWithAssignments | null;
  eventId: string;
  planId: string;
  /** The plan's own room in cm — what a mechitza is re-spanned across when it is turned or moved. */
  roomWidth: number;
  roomLength: number;
  households: HouseholdWithGuests[];
  guestIndex: Map<string, GuestIndexEntry>;
  /** Every seat assignment on the WHOLE plan, keyed by guest — used to tell whether the active
   *  selection (if exactly one guest) already holds a seat elsewhere, which is what makes a tap
   *  on an occupied seat here a SWAP rather than a no-op. */
  assignmentsByGuest: Map<string, SeatAssignmentRow>;
  selectedGuestIds: string[];
  /** Replaces the active selection with exactly this one guest — "pick them up". */
  onPickUpGuest: (guestId: string) => void;
  /** One guest from the active selection has just been seated — the caller drops them from the
   *  selection so a multi-guest pick can be placed one at a time, seat by seat. */
  onGuestPlaced: (guestId: string) => void;
  onChanged: () => void;
  /** The object itself was deleted — the caller closes the sheet and drops any selection state
   *  that referenced it. */
  onDeleted: () => void;
}

/**
 * One floor object's own details (label/number/capacity/notes, lock, delete) plus — for a
 * seatable kind — its seats as a plain list rather than a second miniature SVG ring: a list is
 * far easier to read and tap precisely inside a narrow bottom sheet on a phone than a cramped
 * spatial diagram would be. `FloorCanvas`'s spatial ring already exists on the Room view; this is
 * the "full-height, precise" way to work the same table.
 *
 * Tap an EMPTY seat: places the active selection's first guest there (asks first if the table is
 * locked), or — with no active selection — opens a small inline guest picker for that seat.
 * Tap an OCCUPIED seat: with no selection, "picks up" that guest (they become the active
 * selection); with exactly one already-seated guest selected, SWAPS the two; otherwise explains
 * why nothing happened rather than silently ignoring the tap.
 */
export function TableDetailSheet({
  open,
  onClose,
  object,
  eventId,
  planId,
  roomWidth,
  roomLength,
  households,
  guestIndex,
  assignmentsByGuest,
  selectedGuestIds,
  onPickUpGuest,
  onGuestPlaced,
  onChanged,
  onDeleted,
}: TableDetailSheetProps) {
  const [form, setForm] = useState<DetailFormState>({ label: '', table_number: '', capacity: '', notes: '' });
  const [mechitzaForm, setMechitzaForm] = useState<MechitzaFormState>({ axis: 'vertical', positionM: '' });
  const [saving, setSaving] = useState(false);
  const [busySeat, setBusySeat] = useState<number | null>(null);
  const [pickingForSeat, setPickingForSeat] = useState<number | null>(null);
  const [guestQuery, setGuestQuery] = useState('');

  useEffect(() => {
    if (!open || !object) return;
    setForm(toForm(object));
    if (object.kind === 'mechitza') setMechitzaForm(toMechitzaForm(object));
    setPickingForSeat(null);
    setGuestQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, object?.id]);

  const seatable = object ? isSeatableKind(object.kind) : false;
  const isMechitza = object?.kind === 'mechitza';
  const slots = object && seatable ? seatSlots(object.kind, object.capacity, object.width, object.height) : [];
  const bySlot = object ? assignmentsBySlot(object.assignments, slots.length) : new Map<number, SeatAssignmentRow>();

  const pickableGuests = useMemo(() => {
    const query = guestQuery.trim().toLowerCase();
    const rows: { guestId: string; name: string; householdName: string; alreadySeated: boolean }[] = [];
    for (const household of households) {
      for (const guest of household.guests) {
        const name = guestDisplayName(guest);
        if (query && !name.toLowerCase().includes(query) && !household.name.toLowerCase().includes(query)) continue;
        rows.push({
          guestId: guest.id,
          name,
          householdName: household.name,
          alreadySeated: assignmentsByGuest.has(guest.id),
        });
      }
    }
    return rows;
  }, [households, guestQuery, assignmentsByGuest]);

  if (!object) return null;

  async function handleSaveDetails() {
    if (!object) return;
    const table_number = form.table_number.trim() ? Number(form.table_number.trim()) : null;
    const capacity = form.capacity.trim() ? Number(form.capacity.trim()) : null;
    if (form.table_number.trim() && !Number.isFinite(table_number)) {
      showToast('Table number must be a number.', 'error');
      return;
    }
    if (form.capacity.trim() && !Number.isFinite(capacity)) {
      showToast('Capacity must be a number.', 'error');
      return;
    }
    // Turning or moving a mechitza rebuilds its rectangle through the same helper the room planner
    // uses, so it always spans the full room across whichever axis it now runs. A blank position
    // means the middle.
    const partition = object.kind === 'mechitza'
      ? mechitzaObject(
          roomWidth,
          roomLength,
          mechitzaForm.axis,
          (() => {
            const metres = parseMoneyOrNull(mechitzaForm.positionM);
            return metres != null && metres > 0 ? Math.round(metres * 100) : undefined;
          })(),
        )
      : null;

    setSaving(true);
    try {
      await updateFloorObject(object.id, {
        label: form.label.trim() || null,
        table_number,
        capacity,
        notes: form.notes.trim() || null,
        ...(partition ? { x: partition.x, y: partition.y, width: partition.width, height: partition.height } : {}),
      });
      showToast('Saved', 'success');
      onChanged();
    } catch {
      showToast('Could not save — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleObjectLocked() {
    if (!object) return;
    try {
      await updateFloorObject(object.id, { locked: !object.locked });
      onChanged();
    } catch {
      showToast('Could not update the lock — please try again.', 'error');
    }
  }

  async function handleDeleteObject() {
    if (!object) return;
    const seatedCount = object.assignments.length;
    const ok = await confirmDialog(`Delete ${floorObjectLabel(object)}?`, {
      body: seatedCount > 0 ? `This removes ${seatedCount} seat assignment${seatedCount === 1 ? '' : 's'} too. This cannot be undone.` : 'This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteFloorObject(object.id);
      showToast('Deleted', 'success');
      onDeleted();
    } catch {
      showToast('Could not delete — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function placeGuestAt(guestId: string, seatIndex: number) {
    if (!object) return;
    setBusySeat(seatIndex);
    try {
      await assignSeat(eventId, planId, guestId, object.id, seatIndex);
      showToast('Seated', 'success');
      onGuestPlaced(guestId);
      onChanged();
    } catch {
      showToast('Could not seat that guest — please try again.', 'error');
    } finally {
      setBusySeat(null);
    }
  }

  async function handleEmptySeatTap(seatIndex: number) {
    if (!object) return;
    if (selectedGuestIds.length === 0) {
      setPickingForSeat(seatIndex);
      return;
    }
    if (object.locked) {
      const ok = await confirmDialog('This table is locked', { body: 'Seat a guest here anyway?', tone: 'danger', confirmLabel: 'Seat anyway' });
      if (!ok) return;
    }
    await placeGuestAt(selectedGuestIds[0], seatIndex);
  }

  async function handleOccupiedSeatTap(seatIndex: number, assignment: SeatAssignmentRow) {
    if (!object) return;
    if (assignment.locked) {
      const ok = await confirmDialog('This seat is locked', {
        body: `${guestNameFor(assignment.guest_id)} is locked into this seat. Move them anyway?`,
        tone: 'danger',
        confirmLabel: 'Move anyway',
      });
      if (!ok) return;
    }

    if (selectedGuestIds.length === 0) {
      onPickUpGuest(assignment.guest_id);
      return;
    }

    const candidate = selectedGuestIds[0];
    if (selectedGuestIds.length === 1 && candidate !== assignment.guest_id && assignmentsByGuest.has(candidate)) {
      setBusySeat(seatIndex);
      try {
        await swapSeatAssignments(eventId, planId, candidate, assignment.guest_id);
        showToast('Swapped seats', 'success');
        onGuestPlaced(candidate);
        onChanged();
      } catch {
        showToast('Could not swap those seats — please try again.', 'error');
      } finally {
        setBusySeat(null);
      }
      return;
    }

    showToast('That seat is taken — pick up its guest first, or choose an empty seat.', 'info');
  }

  async function handleRemoveFromSeat(assignment: SeatAssignmentRow) {
    const name = guestNameFor(assignment.guest_id);
    if (assignment.locked) {
      const ok = await confirmDialog('This seat is locked', { body: `Remove ${name} from this seat anyway?`, tone: 'danger', confirmLabel: 'Remove anyway' });
      if (!ok) return;
    } else {
      const ok = await confirmDialog(`Remove ${name} from this seat?`);
      if (!ok) return;
    }
    try {
      await unassignSeat(planId, assignment.guest_id);
      showToast('Seat cleared', 'success');
      onChanged();
    } catch {
      showToast('Could not clear that seat — please try again.', 'error');
    }
  }

  async function handleToggleSeatLocked(assignment: SeatAssignmentRow) {
    try {
      await setSeatLocked(assignment.id, !assignment.locked);
      onChanged();
    } catch {
      showToast('Could not update the lock — please try again.', 'error');
    }
  }

  function guestNameFor(guestId: string): string {
    const entry = guestIndex.get(guestId);
    return entry ? guestDisplayName(entry.guest) : 'This guest';
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={floorObjectLabel(object)}
      description={seatable ? `${object.assignments.length} of ${object.capacity ?? '—'} seated` : undefined}
      anchor="drawer"
      size="md"
      footer={
        <>
          <Button type="button" variant="danger" size="sm" onClick={() => void handleDeleteObject()} disabled={saving}>
            <Trash2 size={14} aria-hidden="true" />
            Delete
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={() => void handleSaveDetails()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      {pickingForSeat != null ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-text-secondary">Choose who sits in seat {pickingForSeat + 1}</p>
            <IconButton label="Cancel" size="sm" onClick={() => setPickingForSeat(null)}>
              <X size={15} aria-hidden="true" />
            </IconButton>
          </div>
          <div className="relative">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input value={guestQuery} onChange={(e) => setGuestQuery(e.target.value)} placeholder="Search guests…" className="pl-8" />
          </div>
          <ul className="flex max-h-[50vh] flex-col divide-y divide-separator-soft overflow-y-auto">
            {pickableGuests.length === 0 ? (
              <EmptyState compact title="No matching guests" />
            ) : (
              pickableGuests.map((row) => (
                <li key={row.guestId}>
                  <button
                    type="button"
                    disabled={busySeat != null}
                    onClick={() => void placeGuestAt(row.guestId, pickingForSeat)}
                    className="flex w-full items-center justify-between gap-2 px-1 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-text-primary">{row.name}</span>
                      <span className="block truncate text-xs text-text-muted">{row.householdName}</span>
                    </span>
                    {row.alreadySeated && (
                      <Badge variant="muted" className="shrink-0">
                        Seated elsewhere
                      </Badge>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Label" htmlFor="object-label" hint="Optional — falls back to a table number or kind">
                <Input id="object-label" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
              </Field>
              <Field label="Table number" htmlFor="object-number">
                <Input
                  id="object-number"
                  inputMode="numeric"
                  value={form.table_number}
                  onChange={(e) => setForm((f) => ({ ...f, table_number: e.target.value }))}
                />
              </Field>
            </div>
            {seatable && (
              <Field label="Capacity" htmlFor="object-capacity">
                <Input
                  id="object-capacity"
                  inputMode="numeric"
                  value={form.capacity}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                />
              </Field>
            )}
            {isMechitza && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Runs" htmlFor="mechitza-axis">
                  <Select
                    id="mechitza-axis"
                    value={mechitzaForm.axis}
                    onChange={(e) => setMechitzaForm((f) => ({ ...f, axis: e.target.value as MechitzaAxis }))}
                  >
                    <option value="vertical">Top to bottom — divides left and right</option>
                    <option value="horizontal">Side to side — divides front and back</option>
                  </Select>
                </Field>
                <Field
                  label={mechitzaForm.axis === 'vertical' ? 'Position from the left (metres)' : 'Position from the front (metres)'}
                  htmlFor="mechitza-position"
                  hint="Blank splits the room down the middle"
                >
                  <Input
                    id="mechitza-position"
                    inputMode="decimal"
                    value={mechitzaForm.positionM}
                    onChange={(e) => setMechitzaForm((f) => ({ ...f, positionM: e.target.value }))}
                    placeholder={String(Math.round(mechitzaForm.axis === 'vertical' ? roomWidth : roomLength) / 200)}
                  />
                </Field>
              </div>
            )}
            <Field label="Notes" htmlFor="object-notes">
              <Textarea id="object-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </Field>
            <button
              type="button"
              onClick={() => void handleToggleObjectLocked()}
              className="flex w-fit items-center gap-1.5 rounded-md border border-separator-control px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
            >
              {object.locked ? <Unlock size={13} aria-hidden="true" /> : <Lock size={13} aria-hidden="true" />}
              {object.locked ? 'Unlock this table' : 'Lock this table'}
            </button>
          </div>

          {seatable ? (
            <div className="border-t border-separator pt-3">
              <p className="mb-2 text-sm font-medium text-text-secondary">Seats</p>
              <ul className="flex flex-col divide-y divide-separator-soft">
                {slots.map((_, index) => {
                  const assignment = bySlot.get(index);
                  const entry = assignment ? guestIndex.get(assignment.guest_id) : undefined;
                  const busy = busySeat === index;
                  return (
                    <li key={index} className="flex items-center gap-2 py-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void (assignment ? handleOccupiedSeatTap(index, assignment) : handleEmptySeatTap(index))
                        }
                        className="min-w-0 flex-1 rounded-md px-1 py-1 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                      >
                        <span className="block text-xs text-text-faint">Seat {index + 1}</span>
                        {entry ? (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm text-text-primary">{guestDisplayName(entry.guest)}</span>
                            {entry.guest.is_vip && <Badge variant="gold">VIP</Badge>}
                            {(entry.guest.dietary || entry.guest.allergies) && <Badge variant="warning">Dietary</Badge>}
                          </span>
                        ) : (
                          <span className="text-sm text-text-muted">Empty — tap to seat someone</span>
                        )}
                      </button>
                      {assignment && (
                        <>
                          <IconButton
                            label={assignment.locked ? 'Unlock this seat' : 'Lock this seat'}
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleToggleSeatLocked(assignment)}
                          >
                            {assignment.locked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}
                          </IconButton>
                          <IconButton
                            label={`Remove ${guestNameFor(assignment.guest_id)} from this seat`}
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleRemoveFromSeat(assignment)}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </IconButton>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <EmptyState
              compact
              icon={UserPlus}
              title="This object doesn't take seats"
              hint={
                isMechitza
                  ? 'A mechitza divides the room. Auto-seat keeps each table wholly on one side of it.'
                  : 'Only tables can hold seat assignments.'
              }
            />
          )}
        </div>
      )}
    </Sheet>
  );
}
