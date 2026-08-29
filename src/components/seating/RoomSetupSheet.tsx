import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input, Select } from '../ui/Field';
import { Toggle } from '../ui/Toggle';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { parseMoneyOrNull } from '../../lib/format';
import { planRoomLayout, type MechitzaAxis } from '../../lib/seating/roomLayout';
import { isSeatableKind } from '../../lib/seating/tableGeometry';
import { replaceFloorObjects, updateSeatingPlan } from '../../data/seating/mutations';
import { ROOM_HEIGHT, ROOM_WIDTH } from './FloorCanvas';
import type { FloorObjectRow, SeatingPlanRow } from '../../data/seating/types';

/**
 * Measure the hall, then let the app work out how many tables fit in it.
 *
 * Dimensions are asked for in METRES and stored in centimetres: nobody measures a ballroom in
 * centimetres, but every coordinate in `bm_floor_objects` is one, so the conversion happens here
 * rather than leaking either unit into the other half of the app.
 *
 * "Auto-plan" never writes silently. It runs `planRoomLayout` on every change and shows what it
 * would do — how many tables, seating how many, how they divide either side of a mechitza, and
 * who would be left standing — so the family decides from the numbers rather than discovering
 * them after the fact.
 */

interface RoomSetupSheetProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  plan: SeatingPlanRow;
  objects: FloorObjectRow[];
  /** Attending guests this plan has to seat — the default head count, not a fixed one. */
  guestCount: number;
  onApplied: () => void;
}

type TableKind = 'table_round' | 'table_long';

/** Metres in, centimetres out. `parseMoneyOrNull` is the repo's one number parser — it handles a
 *  comma decimal and rejects the junk a hand-typed field collects, which `Number()` would not. */
function metresToCm(raw: string): number | null {
  const metres = parseMoneyOrNull(raw);
  if (metres === null || metres <= 0) return null;
  return Math.round(metres * 100);
}

function cmToMetres(cm: number | null | undefined): string {
  if (cm == null) return '';
  return String(Math.round(cm) / 100);
}

/** A plain count, not a measurement — parsed through the same helper so "8 " or "8,0" behaves,
 *  then rounded, since half a seat and half a guest are not things. */
function countOf(raw: string): number | null {
  const parsed = parseMoneyOrNull(raw);
  if (parsed === null || parsed <= 0) return null;
  return Math.round(parsed);
}

/** A mechitza already on the canvas tells you which way it runs and where it stands, so reopening
 *  this sheet shows the split the family actually has rather than resetting it to the middle. */
function readExistingMechitza(objects: FloorObjectRow[]): { axis: MechitzaAxis; position: number } | null {
  const existing = objects.find((o) => o.kind === 'mechitza');
  if (!existing) return null;
  const axis: MechitzaAxis = existing.height >= existing.width ? 'vertical' : 'horizontal';
  return { axis, position: axis === 'vertical' ? existing.x : existing.y };
}

export function RoomSetupSheet({ open, onClose, eventId, plan, objects, guestCount, onApplied }: RoomSetupSheetProps) {
  const [widthM, setWidthM] = useState('');
  const [lengthM, setLengthM] = useState('');
  const [headCount, setHeadCount] = useState('');
  const [tableKind, setTableKind] = useState<TableKind>('table_round');
  const [seatsPerTable, setSeatsPerTable] = useState('');
  const [wantsMechitza, setWantsMechitza] = useState(false);
  const [mechitzaAxis, setMechitzaAxis] = useState<MechitzaAxis>('vertical');
  const [mechitzaPositionM, setMechitzaPositionM] = useState('');
  const [separateSeating, setSeparateSeating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWidthM(cmToMetres(plan.room_width_cm) || String(ROOM_WIDTH / 100));
    setLengthM(cmToMetres(plan.room_length_cm) || String(ROOM_HEIGHT / 100));
    // Blank rather than "0" when nobody is on the guest list yet — a zero would plan zero tables
    // and disable the whole sheet, which is exactly how this looked broken.
    setHeadCount(guestCount > 0 ? String(guestCount) : '');
    setSeparateSeating(plan.separate_seating ?? false);
    const existing = readExistingMechitza(objects);
    setWantsMechitza(existing != null);
    setMechitzaAxis(existing?.axis ?? 'vertical');
    setMechitzaPositionM(existing ? cmToMetres(existing.position) : '');
  }, [open, plan, objects, guestCount]);

  const roomWidth = metresToCm(widthM);
  const roomLength = metresToCm(lengthM);
  const seatsPerTableValue = countOf(seatsPerTable);
  const headCountValue = countOf(headCount) ?? 0;
  const mechitzaPosition = metresToCm(mechitzaPositionM);

  /*
    Anything NOT a table is a keep-out zone the tables have to work around — the dance floor, the
    stage, the bar, the entrance. They are read from the plan rather than asked for again, because
    the family has already placed them on the canvas.
  */
  const reserved = useMemo(
    () => objects.filter((o) => !isSeatableKind(o.kind) && o.kind !== 'mechitza').map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height })),
    [objects],
  );

  const preview = useMemo(() => {
    if (!roomWidth || !roomLength) return null;
    return planRoomLayout({
      roomWidth,
      roomLength,
      guestCount: headCountValue,
      tableKind,
      seatsPerTable: seatsPerTableValue ?? undefined,
      mechitza: wantsMechitza ? { axis: mechitzaAxis, position: mechitzaPosition ?? undefined } : null,
      reserved,
    });
  }, [roomWidth, roomLength, headCountValue, tableKind, seatsPerTableValue, wantsMechitza, mechitzaAxis, mechitzaPosition, reserved]);

  /** How the tables divide either side of the partition — the number the family actually argues
   *  about, and the reason `PlannedTable.side` is computed at all. */
  const split = useMemo(() => {
    if (!preview?.mechitza) return null;
    return {
      a: preview.tables.filter((t) => t.side === 'a').length,
      b: preview.tables.filter((t) => t.side === 'b').length,
    };
  }, [preview]);

  /** Nothing to lay out at all — no tables AND no partition. Anything less than that is a real
   *  layout worth applying, including a mechitza on its own before the guest list exists. */
  const nothingToApply = !preview || (preview.tables.length === 0 && !preview.mechitza);

  async function handleApply() {
    if (!roomWidth || !roomLength || !preview || nothingToApply || saving) return;

    // Only unlocked tables and the old mechitza are replaced. A locked table is somebody's
    // deliberate decision — the top table by the dance floor — and auto-planning must not undo it.
    const replaceable = objects.filter((o) => !o.locked && (isSeatableKind(o.kind) || o.kind === 'mechitza'));
    const lockedTables = objects.filter((o) => o.locked && isSeatableKind(o.kind));
    const lockedCount = lockedTables.length;

    // Number the new tables ABOVE whatever the locked ones already use, so a locked "Table 1" and
    // a freshly planned "Table 1" cannot end up in the same room.
    const highestLocked = lockedTables.reduce((max, o) => Math.max(max, o.table_number ?? 0), 0);

    const tableSummary =
      preview.tables.length > 0
        ? `This lays out ${preview.tables.length} ${preview.tables.length === 1 ? 'table' : 'tables'} and removes`
        : 'This puts the mechitza in place and removes';

    const ok = await confirmDialog('Replace the tables in this plan?', {
      body:
        `${tableSummary} ${replaceable.length} existing ${replaceable.length === 1 ? 'item' : 'items'}.` +
        (lockedCount > 0 ? ` ${lockedCount} locked ${lockedCount === 1 ? 'table stays' : 'tables stay'} where ${lockedCount === 1 ? 'it is' : 'they are'}.` : '') +
        ' Seat assignments on the removed tables are cleared.',
      confirmLabel: preview.tables.length > 0 ? 'Replace tables' : 'Place mechitza',
    });
    if (!ok) return;

    setSaving(true);
    try {
      await updateSeatingPlan(plan.id, {
        name: plan.name,
        room_width_cm: roomWidth,
        room_length_cm: roomLength,
        separate_seating: separateSeating,
      });

      await replaceFloorObjects(
        eventId,
        plan.id,
        replaceable.map((o) => o.id),
        [
          ...(preview.mechitza
            ? [{ kind: 'mechitza' as const, x: preview.mechitza.x, y: preview.mechitza.y, width: preview.mechitza.width, height: preview.mechitza.height }]
            : []),
          ...preview.tables.map((table, index) => ({
            kind: table.kind,
            table_number: highestLocked + index + 1,
            capacity: table.capacity,
            x: table.x,
            y: table.y,
            width: table.width,
            height: table.height,
          })),
        ],
      );

      showToast(
        preview.tables.length > 0 ? `${preview.tables.length} tables laid out` : 'Mechitza placed',
        'success',
      );
      onApplied();
      onClose();
    } catch {
      showToast('Could not save the layout — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Room and tables"
      anchor="drawer"
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleApply()} disabled={saving || nothingToApply}>
            {saving ? 'Laying out…' : preview && preview.tables.length === 0 && preview.mechitza ? 'Place mechitza' : 'Auto-plan tables'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-sm font-medium text-text-secondary">The room</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Width (metres)" htmlFor="room-width" required>
              <Input id="room-width" inputMode="decimal" value={widthM} onChange={(e) => setWidthM(e.target.value)} placeholder="20" />
            </Field>
            <Field label="Length (metres)" htmlFor="room-length" required>
              <Input id="room-length" inputMode="decimal" value={lengthM} onChange={(e) => setLengthM(e.target.value)} placeholder="15" />
            </Field>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Measure the usable floor. A metre of walkway is kept clear at the walls automatically.
          </p>
        </div>

        <Field
          label="People to seat"
          htmlFor="room-head-count"
          hint={
            guestCount > 0
              ? 'Defaults to your attending guests — change it to plan for a different number.'
              : 'Type a number to plan the room before the guest list is finalised.'
          }
        >
          <Input
            id="room-head-count"
            inputMode="numeric"
            value={headCount}
            onChange={(e) => setHeadCount(e.target.value)}
            placeholder="120"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Table shape" htmlFor="room-table-kind">
            <Select id="room-table-kind" value={tableKind} onChange={(e) => setTableKind(e.target.value as TableKind)}>
              <option value="table_round">Round — seats more per square metre</option>
              <option value="table_long">Long — banqueting style</option>
            </Select>
          </Field>
          <Field label="Seats per table" htmlFor="room-seats" hint="Leave blank for the standard size">
            <Input id="room-seats" inputMode="numeric" value={seatsPerTable} onChange={(e) => setSeatsPerTable(e.target.value)} placeholder="8" />
          </Field>
        </div>

        <div className="flex flex-col gap-3 border-t border-separator pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">Mechitza</p>
              <p className="text-xs text-text-muted">Divides the room; tables are laid out on both sides.</p>
            </div>
            <Toggle checked={wantsMechitza} onChange={() => setWantsMechitza((v) => !v)} label="Include a mechitza" />
          </div>

          {wantsMechitza && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Runs" htmlFor="room-mechitza-axis">
                  <Select id="room-mechitza-axis" value={mechitzaAxis} onChange={(e) => setMechitzaAxis(e.target.value as MechitzaAxis)}>
                    <option value="vertical">Top to bottom — divides left and right</option>
                    <option value="horizontal">Side to side — divides front and back</option>
                  </Select>
                </Field>
                <Field
                  label={mechitzaAxis === 'vertical' ? 'Position from the left (metres)' : 'Position from the front (metres)'}
                  htmlFor="room-mechitza-position"
                  hint="Leave blank to split the room down the middle"
                >
                  <Input
                    id="room-mechitza-position"
                    inputMode="decimal"
                    value={mechitzaPositionM}
                    onChange={(e) => setMechitzaPositionM(e.target.value)}
                    placeholder={cmToMetres(
                      mechitzaAxis === 'vertical' ? (roomWidth ?? ROOM_WIDTH) / 2 : (roomLength ?? ROOM_HEIGHT) / 2,
                    )}
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">Separate seating</p>
                  <p className="text-xs text-text-muted">
                    Auto-seat puts men and women on opposite sides. Leave off for a mechitza used only for davening.
                  </p>
                </div>
                <Toggle checked={separateSeating} onChange={() => setSeparateSeating((v) => !v)} label="Seat men and women separately" />
              </div>
            </>
          )}
        </div>

        {preview && (
          <div className="rounded-lg border border-separator-soft bg-canvas-raised p-3">
            <p className="text-sm font-medium text-text-secondary">What fits</p>
            {headCountValue > 0 ? (
              <p className="mt-1 text-sm text-text-primary">
                {preview.tables.length} {preview.tables.length === 1 ? 'table' : 'tables'}, seating {preview.seatedCapacity} — for{' '}
                {headCountValue} {headCountValue === 1 ? 'person' : 'people'}.
              </p>
            ) : (
              <p className="mt-1 text-sm text-text-primary">
                No tables yet — enter how many people you are seating and they will be laid out here.
              </p>
            )}
            {split && (
              <p className="mt-1 text-sm text-text-secondary">
                {mechitzaAxis === 'vertical'
                  ? `${split.a} ${split.a === 1 ? 'table' : 'tables'} to the left of the mechitza, ${split.b} to the right.`
                  : `${split.a} ${split.a === 1 ? 'table' : 'tables'} in front of the mechitza, ${split.b} behind.`}
              </p>
            )}
            {preview.warnings.map((warning) => (
              <p key={warning} className="mt-2 rounded-md bg-warning-bg px-3 py-2 text-xs text-warning-text">
                {warning}
              </p>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
