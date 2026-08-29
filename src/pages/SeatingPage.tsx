import { useEffect, useMemo, useState } from 'react';
import { Armchair, Download, MoreVertical, Plus, Ruler, Users, Wand2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Card } from '../components/ui/Card';
import { Menu } from '../components/ui/Menu';
import { Select } from '../components/ui/Field';
import { Tabs, type TabItem } from '../components/ui/Tabs';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonText } from '../components/ui/Skeleton';
import { showToast } from '../hooks/useToast';
import { confirmDialog, promptDialog } from '../hooks/useConfirm';
import { useEventContext } from '../data/event/context';
import { useFunctions } from '../data/event/hooks';
import { useGuestBook } from '../data/guests/hooks';
import { useSeatingPlan, useSeatingPlans, useSeatingPreferences } from '../data/seating/hooks';
import {
  assignSeat,
  createFloorObject,
  createSeatingPlan,
  deleteSeatingPlan,
  updateFloorObject,
  updateSeatingPlan,
} from '../data/seating/mutations';
import { computeSeatingWarnings, guestDisplayName, indexGuests, isGuestRelevantToPlan } from '../lib/seating/warnings';
import { defaultObjectSize, floorObjectKindLabel, floorObjectLabel, isSeatableKind } from '../lib/seating/tableGeometry';
import { FloorCanvas, ROOM_HEIGHT, ROOM_WIDTH } from '../components/seating/FloorCanvas';
import { TableDetailSheet } from '../components/seating/TableDetailSheet';
import { RosterPanel } from '../components/seating/RosterPanel';
import { WarningsPanel } from '../components/seating/WarningsPanel';
import { PreferencesSheet } from '../components/seating/PreferencesSheet';
import { RoomSetupSheet } from '../components/seating/RoomSetupSheet';
import { autoSeat } from '../lib/seating/autoSeat';
import { replaceSeatAssignments } from '../data/seating/mutations';
import { GuestListView } from '../components/seating/GuestListView';
import { UnseatedView } from '../components/seating/UnseatedView';
import { downloadCsv } from '../lib/exportCsv';
import type { HouseholdWithGuests } from '../data/guests/types';
import type { FloorObjectKind } from '../data/seating/types';

type SeatingTab = 'room' | 'table' | 'guests' | 'unseated';

const TABS: TabItem<SeatingTab>[] = [
  { key: 'room', label: 'Room' },
  { key: 'table', label: 'Table detail' },
  { key: 'guests', label: 'Guest list' },
  { key: 'unseated', label: 'Unseated' },
];

export function SeatingPage() {
  const { eventId } = useEventContext();
  const { data: plans, loading: plansLoading, reload: reloadPlans } = useSeatingPlans();
  const { data: households } = useGuestBook();
  const { data: functions } = useFunctions();
  const { data: preferences, reload: reloadPreferences } = useSeatingPreferences();

  const [planId, setPlanId] = useState<string | null>(null);
  const { data: plan, loading: planLoading, reload: reloadPlan } = useSeatingPlan(planId);

  const [tab, setTab] = useState<SeatingTab>('room');
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([]);
  const [detailObjectId, setDetailObjectId] = useState<string | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [roomSetupOpen, setRoomSetupOpen] = useState(false);
  const [autoSeating, setAutoSeating] = useState(false);

  // Once the plan list has loaded, default to the first plan — nothing to pick if there are none.
  useEffect(() => {
    if (planId || !plans || plans.length === 0) return;
    setPlanId(plans[0].id);
  }, [plans, planId]);

  const objects = useMemo(() => plan?.objects ?? [], [plan]);
  const assignments = useMemo(() => objects.flatMap((o) => o.assignments), [objects]);
  const assignmentsByGuest = useMemo(() => new Map(assignments.map((a) => [a.guest_id, a] as const)), [assignments]);
  const objectsById = useMemo(() => new Map(objects.map((o) => [o.id, o] as const)), [objects]);
  const guestIndex = useMemo(() => indexGuests(households ?? []), [households]);
  const detailObject = detailObjectId ? (objectsById.get(detailObjectId) ?? null) : null;

  const warnings = useMemo(() => {
    if (!plan) return [];
    return computeSeatingWarnings({ plan, objects, assignments, households: households ?? [], preferences: preferences ?? [] });
  }, [plan, objects, assignments, households, preferences]);

  function reloadEverything() {
    reloadPlan();
    reloadPreferences();
  }

  /** Everyone this plan has to seat — what the room planner sizes the table count against. */
  const attendingCount = useMemo(() => {
    if (!plan) return 0;
    return (households ?? []).reduce(
      (total, household) => total + household.guests.filter((g) => isGuestRelevantToPlan(g, plan)).length,
      0,
    );
  }, [households, plan]);

  async function handleAutoSeat() {
    if (!plan || autoSeating) return;

    const result = autoSeat({
      plan,
      households: households ?? [],
      objects,
      preferences: preferences ?? [],
      existing: assignments,
      separateSeating: plan.separate_seating,
    });

    // The numbers go in front of the family BEFORE anything is written — an auto-seat that
    // silently rearranged an evening's work would be unforgivable, and the count of guests it
    // could not place is the thing they most need to know.
    const ok = await confirmDialog('Seat everyone automatically?', {
      body:
        `This seats ${result.assignments.length} ${result.assignments.length === 1 ? 'guest' : 'guests'} and replaces the current arrangement. Locked seats stay where they are.` +
        (result.unseated.length > 0 ? ` ${result.unseated.length} could not be seated.` : '') +
        (result.warnings.length > 0 ? `\n\n${result.warnings.join('\n')}` : ''),
      confirmLabel: 'Auto-seat',
    });
    if (!ok) return;

    setAutoSeating(true);
    try {
      await replaceSeatAssignments(eventId, plan.id, result.assignments);
      showToast(
        result.unseated.length > 0
          ? `Seated ${result.assignments.length}; ${result.unseated.length} still need a seat`
          : `Seated ${result.assignments.length} guests`,
        result.unseated.length > 0 ? 'info' : 'success',
      );
      reloadPlan();
    } catch {
      showToast('Could not save the seating — please try again.', 'error');
    } finally {
      setAutoSeating(false);
    }
  }

  function toggleGuest(guestId: string) {
    setSelectedGuestIds((ids) => (ids.includes(guestId) ? ids.filter((id) => id !== guestId) : [...ids, guestId]));
  }

  function toggleHousehold(household: HouseholdWithGuests) {
    if (!plan) return;
    const eligible = household.guests
      .filter((g) => isGuestRelevantToPlan(g, plan) && !assignmentsByGuest.has(g.id))
      .map((g) => g.id);
    if (eligible.length === 0) return;
    setSelectedGuestIds((ids) => {
      const allSelected = eligible.every((id) => ids.includes(id));
      if (allSelected) return ids.filter((id) => !eligible.includes(id));
      return Array.from(new Set([...ids, ...eligible]));
    });
  }

  function consumeGuestFromSelection(guestId: string) {
    setSelectedGuestIds((ids) => ids.filter((id) => id !== guestId));
  }

  async function handlePlaceSelectionAtObject(objectId: string) {
    if (!plan || selectedGuestIds.length === 0) return;
    const object = objectsById.get(objectId);
    if (!object) return;

    if (object.locked) {
      const ok = await confirmDialog('This table is locked', { body: 'Seat guests here anyway?', tone: 'danger', confirmLabel: 'Seat anyway' });
      if (!ok) return;
    }

    const freeSeats = object.capacity != null ? Math.max(object.capacity - object.assignments.length, 0) : selectedGuestIds.length;
    const toPlace = selectedGuestIds.slice(0, freeSeats);
    if (toPlace.length === 0) {
      showToast('That table is full.', 'error');
      return;
    }

    try {
      // Sequential, not Promise.all: each seat write should land before the next is attempted,
      // so a mid-batch failure leaves the earlier guests seated rather than racing every insert.
      for (const guestId of toPlace) {
        await assignSeat(eventId, plan.id, guestId, objectId);
      }
      const overflow = selectedGuestIds.length - toPlace.length;
      showToast(
        overflow > 0
          ? `Seated ${toPlace.length} — the table only had room for that many.`
          : `Seated ${toPlace.length} guest${toPlace.length === 1 ? '' : 's'} at ${floorObjectLabel(object)}.`,
        overflow > 0 ? 'info' : 'success',
      );
      setSelectedGuestIds((ids) => ids.filter((id) => !toPlace.includes(id)));
      reloadPlan();
    } catch {
      showToast('Could not seat everyone — please try again.', 'error');
    }
  }

  async function handleMoveObject(objectId: string, x: number, y: number) {
    try {
      await updateFloorObject(objectId, { x, y });
      reloadPlan();
    } catch {
      showToast('Could not move that — please try again.', 'error');
    }
  }

  async function handleAddObject(kind: FloorObjectKind) {
    if (!plan) return;
    const size = defaultObjectSize(kind);
    const sameKindCount = objects.filter((o) => o.kind === kind).length;
    const offset = sameKindCount * 40;
    const existingNumbers = objects.map((o) => o.table_number).filter((n): n is number => n != null);
    const nextTableNumber = isSeatableKind(kind) ? (existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1) : null;

    try {
      await createFloorObject(eventId, plan.id, {
        kind,
        capacity: size.capacity,
        width: size.width,
        height: size.height,
        table_number: nextTableNumber,
        x: ROOM_WIDTH / 2 + offset,
        y: ROOM_HEIGHT / 2 + offset,
      });
      showToast(`Added ${floorObjectKindLabel(kind).toLowerCase()}`, 'success');
      reloadPlan();
    } catch {
      showToast('Could not add that — please try again.', 'error');
    }
  }

  function handleObjectDeleted() {
    setDetailObjectId(null);
    reloadPlan();
  }

  async function handleCreatePlan() {
    const name = await promptDialog('Name this seating plan', {
      input: { label: 'Plan name', required: true, defaultValue: plans && plans.length > 0 ? `Plan ${plans.length + 1}` : 'Seating plan' },
    });
    if (!name) return;
    try {
      const created = await createSeatingPlan(eventId, { name });
      reloadPlans();
      setPlanId(created.id);
      showToast('Plan created', 'success');
    } catch {
      showToast('Could not create the plan — please try again.', 'error');
    }
  }

  async function handleRenamePlan() {
    if (!plan) return;
    const name = await promptDialog('Rename this plan', { input: { label: 'Plan name', required: true, defaultValue: plan.name } });
    if (!name || name === plan.name) return;
    try {
      await updateSeatingPlan(plan.id, { name });
      reloadPlan();
      reloadPlans();
      showToast('Renamed', 'success');
    } catch {
      showToast('Could not rename — please try again.', 'error');
    }
  }

  async function handleDeletePlan() {
    if (!plan) return;
    const ok = await confirmDialog(`Delete "${plan.name}"?`, {
      body: 'This removes every table and seat assignment in this plan. This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Delete plan',
    });
    if (!ok) return;
    try {
      await deleteSeatingPlan(plan.id);
      showToast('Plan deleted', 'success');
      setPlanId(null);
      reloadPlans();
    } catch {
      showToast('Could not delete — please try again.', 'error');
    }
  }

  async function handleChangePlanFunction(functionId: string) {
    if (!plan) return;
    try {
      await updateSeatingPlan(plan.id, { function_id: functionId || null });
      reloadPlan();
    } catch {
      showToast('Could not update — please try again.', 'error');
    }
  }

  function handleExportCsv() {
    if (!plan) return;
    const rows: (string | number | null)[][] = [];
    for (const household of households ?? []) {
      for (const guest of household.guests) {
        const assignment = assignmentsByGuest.get(guest.id);
        const object = assignment ? objectsById.get(assignment.object_id) : undefined;
        rows.push([
          guestDisplayName(guest),
          household.name,
          object ? floorObjectLabel(object) : '',
          assignment?.seat_index != null ? assignment.seat_index + 1 : '',
        ]);
      }
    }
    downloadCsv(`${plan.name || 'seating-plan'}-seating`, ['Guest name', 'Household', 'Table', 'Seat'], rows);
  }

  function jumpToObject(objectId: string) {
    setDetailObjectId(objectId);
    setTab('room');
  }

  function jumpToGuest() {
    setTab('guests');
  }

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader
        title="Seating"
        subtitle="Plan the room, seat by seat."
        actions={
          plan ? (
            <>
              {plans && plans.length > 1 && (
                <Select
                  aria-label="Switch seating plan"
                  value={plan.id}
                  onChange={(e) => setPlanId(e.target.value)}
                  className="w-auto min-w-[140px]"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
              <Select
                aria-label="Which function this plan seats"
                value={plan.function_id ?? ''}
                onChange={(e) => void handleChangePlanFunction(e.target.value)}
                className="w-auto min-w-[140px]"
              >
                <option value="">Whole event</option>
                {(functions ?? []).map((fn) => (
                  <option key={fn.id} value={fn.id}>
                    {fn.name}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="secondary" size="sm" onClick={() => setRoomSetupOpen(true)}>
                <Ruler size={14} aria-hidden="true" />
                Room
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleAutoSeat()}
                disabled={autoSeating || objects.length === 0}
              >
                <Wand2 size={14} aria-hidden="true" />
                {autoSeating ? 'Seating…' : 'Auto-seat'}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setPreferencesOpen(true)}>
                <Users size={14} aria-hidden="true" />
                Preferences
              </Button>
              <IconButton label="Export seating as CSV" onClick={handleExportCsv}>
                <Download size={16} aria-hidden="true" />
              </IconButton>
              <Menu
                label="Plan actions"
                align="right"
                items={[
                  { key: 'new', label: 'New plan', onSelect: () => void handleCreatePlan() },
                  { key: 'rename', label: 'Rename plan', onSelect: () => void handleRenamePlan() },
                  { key: 'delete', label: 'Delete plan', tone: 'danger', separatorBefore: true, onSelect: () => void handleDeletePlan() },
                ]}
                trigger={(triggerProps) => (
                  <IconButton label="Plan actions" {...triggerProps}>
                    <MoreVertical size={16} aria-hidden="true" />
                  </IconButton>
                )}
              />
            </>
          ) : (
            <Button type="button" onClick={() => void handleCreatePlan()}>
              <Plus size={15} aria-hidden="true" />
              New plan
            </Button>
          )
        }
      />

      {plansLoading && !plans ? (
        <Card>
          <SkeletonText lines={4} />
        </Card>
      ) : !plans || plans.length === 0 ? (
        <EmptyState
          icon={Armchair}
          title="No seating plans yet"
          hint="Create a plan, add tables, and start seating your guests."
          action={
            <Button type="button" size="sm" onClick={() => void handleCreatePlan()}>
              <Plus size={14} aria-hidden="true" />
              Create seating plan
            </Button>
          }
        />
      ) : planLoading && !plan ? (
        <Card>
          <SkeletonText lines={4} />
        </Card>
      ) : !plan ? null : (
        <>
          <Tabs items={TABS} value={tab} onChange={setTab} ariaLabel="Seating views" className="mb-4" />

          {tab === 'room' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px,minmax(0,1fr)]">
              <RosterPanel
                households={households ?? []}
                plan={plan}
                assignmentsByGuest={assignmentsByGuest}
                selectedGuestIds={selectedGuestIds}
                onToggleGuest={toggleGuest}
                onToggleHousehold={toggleHousehold}
                onClearSelection={() => setSelectedGuestIds([])}
              />
              <div className="flex flex-col gap-4">
                <FloorCanvas
                  objects={objects}
                  guestIndex={guestIndex}
                  hasActiveSelection={selectedGuestIds.length > 0}
                  onPlaceSelection={(objectId) => void handlePlaceSelectionAtObject(objectId)}
                  onOpenTable={(objectId) => setDetailObjectId(objectId)}
                  onMoveObject={(objectId, x, y) => void handleMoveObject(objectId, x, y)}
                  onAddObject={(kind) => void handleAddObject(kind)}
                  roomWidth={plan.room_width_cm ?? undefined}
                  roomLength={plan.room_length_cm ?? undefined}
                />
                <Card>
                  <h2 className="mb-2 text-sm font-semibold text-text-primary">Warnings</h2>
                  <WarningsPanel warnings={warnings} onJumpToObject={jumpToObject} onJumpToGuest={jumpToGuest} />
                </Card>
              </div>
            </div>
          )}

          {tab === 'table' &&
            (objects.length === 0 ? (
              <EmptyState compact icon={Armchair} title="No tables yet" hint="Add one from the Room view." />
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {objects.map((object) => (
                  <li key={object.id}>
                    <button
                      type="button"
                      onClick={() => setDetailObjectId(object.id)}
                      className="w-full rounded-lg border border-separator bg-surface p-3 text-left transition-colors hover:border-plum-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                    >
                      <p className="truncate text-sm font-semibold text-text-primary">{floorObjectLabel(object)}</p>
                      <p className="text-xs text-text-muted">
                        {isSeatableKind(object.kind) ? `${object.assignments.length}/${object.capacity ?? '—'} seated` : floorObjectKindLabel(object.kind)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'guests' && (
            <Card padding="none">
              <div className="overflow-x-auto p-2">
                <GuestListView households={households ?? []} assignmentsByGuest={assignmentsByGuest} objectsById={objectsById} onJumpToObject={jumpToObject} />
              </div>
            </Card>
          )}

          {tab === 'unseated' && (
            <UnseatedView
              households={households ?? []}
              plan={plan}
              assignmentsByGuest={assignmentsByGuest}
              selectedGuestIds={selectedGuestIds}
              onToggleGuest={toggleGuest}
            />
          )}
        </>
      )}

      <TableDetailSheet
        open={detailObjectId != null}
        onClose={() => setDetailObjectId(null)}
        object={detailObject}
        eventId={eventId}
        planId={plan?.id ?? ''}
        households={households ?? []}
        guestIndex={guestIndex}
        assignmentsByGuest={assignmentsByGuest}
        selectedGuestIds={selectedGuestIds}
        onPickUpGuest={(guestId) => setSelectedGuestIds([guestId])}
        onGuestPlaced={consumeGuestFromSelection}
        onChanged={reloadPlan}
        onDeleted={handleObjectDeleted}
      />

      {plan && (
        <>
        <RoomSetupSheet
          open={roomSetupOpen}
          onClose={() => setRoomSetupOpen(false)}
          eventId={eventId}
          plan={plan}
          objects={objects}
          guestCount={attendingCount}
          onApplied={reloadPlan}
        />

        <PreferencesSheet
          open={preferencesOpen}
          onClose={() => setPreferencesOpen(false)}
          eventId={eventId}
          households={households ?? []}
          preferences={preferences ?? []}
          guestIndex={guestIndex}
          onChanged={reloadEverything}
        />
        </>
      )}
    </div>
  );
}
