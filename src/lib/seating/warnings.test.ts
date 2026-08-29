import { describe, expect, it } from 'vitest';
import {
  checkOverCapacity,
  checkPreferenceViolations,
  checkSplitHouseholds,
  checkUnseatedAttending,
  computeSeatingWarnings,
  guestDisplayName,
  indexGuests,
  isGuestRelevantToPlan,
} from './warnings';
import type { GuestFunctionInviteRow, GuestWithDetails, HouseholdWithGuests, RsvpStatus } from '../../data/guests/types';
import type { FloorObjectRow, SeatAssignmentRow, SeatingPlanRow, SeatingPreferenceRow } from '../../data/seating/types';

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function makeInvite(overrides: Partial<GuestFunctionInviteRow> = {}): GuestFunctionInviteRow {
  return {
    id: nextId('invite'),
    event_id: 'evt-1',
    guest_id: 'guest-x',
    function_id: 'fn-1',
    invited: true,
    rsvp: 'attending',
    responded_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeGuest(overrides: Partial<Omit<GuestWithDetails, 'tagIds' | 'functionInvites'>> & { functionInvites?: GuestFunctionInviteRow[] } = {}): GuestWithDetails {
  const id = overrides.id ?? nextId('guest');
  return {
    id,
    event_id: 'evt-1',
    household_id: 'house-1',
    first_name: 'Jane',
    last_name: 'Cohen',
    guest_type: 'adult',
    age: null,
    gender: null,
    dietary: null,
    allergies: null,
    meal_preference: null,
    child_meal: false,
    high_chair: false,
    baby_seat: false,
    accessibility: null,
    relationship: null,
    is_vip: false,
    notes: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    tagIds: [],
    functionInvites: [makeInvite({ guest_id: id })],
    ...overrides,
  };
}

function makeHousehold(overrides: Partial<Omit<HouseholdWithGuests, 'tagIds' | 'guests'>> & { guests?: GuestWithDetails[] } = {}): HouseholdWithGuests {
  return {
    id: nextId('house'),
    event_id: 'evt-1',
    name: 'The Cohen Family',
    main_contact_name: null,
    address_lines: null,
    postcode: null,
    email: null,
    phone: null,
    whatsapp: null,
    category: null,
    side_of_family: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    created_by: null,
    tagIds: [],
    guests: [],
    ...overrides,
  };
}

function makePlan(overrides: Partial<SeatingPlanRow> = {}): SeatingPlanRow {
  return {
    id: 'plan-1',
    event_id: 'evt-1',
    function_id: null,
    name: 'Party seating',
    room_width_cm: null,
    room_length_cm: null,
    separate_seating: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeObject(overrides: Partial<FloorObjectRow> = {}): FloorObjectRow {
  return {
    id: nextId('object'),
    event_id: 'evt-1',
    plan_id: 'plan-1',
    kind: 'table_round',
    label: null,
    table_number: 1,
    capacity: 8,
    x: 0,
    y: 0,
    width: 150,
    height: 150,
    rotation: 0,
    locked: false,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<SeatAssignmentRow> = {}): SeatAssignmentRow {
  return {
    id: nextId('assignment'),
    event_id: 'evt-1',
    plan_id: 'plan-1',
    guest_id: 'guest-x',
    object_id: 'object-x',
    seat_index: null,
    locked: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePreference(overrides: Partial<SeatingPreferenceRow> = {}): SeatingPreferenceRow {
  return {
    id: nextId('pref'),
    event_id: 'evt-1',
    guest_a: 'guest-a',
    guest_b: 'guest-b',
    rule: 'must_together',
    note: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('guestDisplayName', () => {
  it('joins first and last name', () => {
    expect(guestDisplayName({ first_name: 'Jane', last_name: 'Cohen' })).toBe('Jane Cohen');
  });

  it('drops a missing last name rather than leaving a trailing space', () => {
    expect(guestDisplayName({ first_name: 'Jane', last_name: null })).toBe('Jane');
  });
});

describe('indexGuests', () => {
  it('maps every guest id to its guest and household', () => {
    const guest = makeGuest({ id: 'g1' });
    const household = makeHousehold({ id: 'h1', guests: [guest] });
    const index = indexGuests([household]);
    expect(index.get('g1')).toEqual({ guest, household });
    expect(index.size).toBe(1);
  });
});

describe('isGuestRelevantToPlan', () => {
  it('a function-scoped plan only cares about that function\'s own invite', () => {
    const plan = makePlan({ function_id: 'fn-1' });
    const attendingThisFn = makeGuest({ functionInvites: [makeInvite({ function_id: 'fn-1', rsvp: 'attending' })] });
    const attendingOtherFn = makeGuest({ functionInvites: [makeInvite({ function_id: 'fn-2', rsvp: 'attending' })] });
    const decliningThisFn = makeGuest({ functionInvites: [makeInvite({ function_id: 'fn-1', rsvp: 'declined' })] });

    expect(isGuestRelevantToPlan(attendingThisFn, plan)).toBe(true);
    expect(isGuestRelevantToPlan(attendingOtherFn, plan)).toBe(false);
    expect(isGuestRelevantToPlan(decliningThisFn, plan)).toBe(false);
  });

  it('a whole-event plan (no function_id) counts a guest attending ANY invited function', () => {
    const plan = makePlan({ function_id: null });
    const attendingOne = makeGuest({
      functionInvites: [
        makeInvite({ function_id: 'fn-1', rsvp: 'declined' }),
        makeInvite({ function_id: 'fn-2', rsvp: 'attending' }),
      ],
    });
    const attendingNone = makeGuest({
      functionInvites: [makeInvite({ function_id: 'fn-1', rsvp: 'awaiting' })],
    });

    expect(isGuestRelevantToPlan(attendingOne, plan)).toBe(true);
    expect(isGuestRelevantToPlan(attendingNone, plan)).toBe(false);
  });

  it('a whole-event plan ignores an invite the guest was never actually invited to', () => {
    const plan = makePlan({ function_id: null });
    const notInvited = makeGuest({
      functionInvites: [makeInvite({ invited: false, rsvp: 'attending' as RsvpStatus })],
    });
    expect(isGuestRelevantToPlan(notInvited, plan)).toBe(false);
  });
});

describe('checkOverCapacity', () => {
  it('flags an object seated beyond its own capacity', () => {
    const object = makeObject({ id: 'obj-1', capacity: 2, label: 'Top table' });
    const assignments = [
      makeAssignment({ object_id: 'obj-1' }),
      makeAssignment({ object_id: 'obj-1' }),
      makeAssignment({ object_id: 'obj-1' }),
    ];
    const warnings = checkOverCapacity([object], assignments);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ severity: 'error', objectId: 'obj-1' });
    expect(warnings[0].message).toContain('Top table');
    expect(warnings[0].message).toContain('3 seated');
    expect(warnings[0].message).toContain('capacity is 2');
  });

  it('does not flag a table at or under capacity', () => {
    const object = makeObject({ id: 'obj-1', capacity: 2 });
    const assignments = [makeAssignment({ object_id: 'obj-1' }), makeAssignment({ object_id: 'obj-1' })];
    expect(checkOverCapacity([object], assignments)).toEqual([]);
  });

  it('never flags a table with no capacity set', () => {
    const object = makeObject({ id: 'obj-1', capacity: null });
    const assignments = [makeAssignment({ object_id: 'obj-1' }), makeAssignment({ object_id: 'obj-1' }), makeAssignment({ object_id: 'obj-1' })];
    expect(checkOverCapacity([object], assignments)).toEqual([]);
  });
});

describe('checkUnseatedAttending', () => {
  it('flags an attending guest with no seat assignment at all', () => {
    const plan = makePlan({ function_id: null });
    const guest = makeGuest({ id: 'g1', first_name: 'Dov', last_name: 'Katz' });
    const household = makeHousehold({ name: 'The Katz Family', guests: [guest] });
    const warnings = checkUnseatedAttending(plan, [household], []);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ severity: 'warning', guestIds: ['g1'] });
    expect(warnings[0].message).toBe('Dov Katz (The Katz Family) is attending but has no seat.');
  });

  it('does not flag a seated guest', () => {
    const plan = makePlan({ function_id: null });
    const guest = makeGuest({ id: 'g1' });
    const household = makeHousehold({ guests: [guest] });
    const warnings = checkUnseatedAttending(plan, [household], [makeAssignment({ guest_id: 'g1' })]);
    expect(warnings).toEqual([]);
  });

  it('does not flag a guest not relevant to this plan', () => {
    const plan = makePlan({ function_id: 'fn-1' });
    const guest = makeGuest({ id: 'g1', functionInvites: [makeInvite({ function_id: 'fn-1', rsvp: 'declined' })] });
    const household = makeHousehold({ guests: [guest] });
    expect(checkUnseatedAttending(plan, [household], [])).toEqual([]);
  });
});

describe('checkSplitHouseholds', () => {
  it('flags a household whose relevant guests sit at more than one table', () => {
    const plan = makePlan({ function_id: null });
    const g1 = makeGuest({ id: 'g1' });
    const g2 = makeGuest({ id: 'g2' });
    const household = makeHousehold({ name: 'The Cohens', guests: [g1, g2] });
    const objects = [makeObject({ id: 'obj-1', label: 'Table 1' }), makeObject({ id: 'obj-2', label: 'Table 2' })];
    const assignments = [makeAssignment({ guest_id: 'g1', object_id: 'obj-1' }), makeAssignment({ guest_id: 'g2', object_id: 'obj-2' })];

    const warnings = checkSplitHouseholds(plan, objects, [household], assignments);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('info');
    expect(warnings[0].message).toContain('The Cohens');
    expect(warnings[0].message).toContain('Table 1');
    expect(warnings[0].message).toContain('Table 2');
    expect(warnings[0].guestIds?.sort()).toEqual(['g1', 'g2']);
  });

  it('does not flag a household entirely at one table', () => {
    const plan = makePlan({ function_id: null });
    const g1 = makeGuest({ id: 'g1' });
    const g2 = makeGuest({ id: 'g2' });
    const household = makeHousehold({ guests: [g1, g2] });
    const objects = [makeObject({ id: 'obj-1' })];
    const assignments = [makeAssignment({ guest_id: 'g1', object_id: 'obj-1' }), makeAssignment({ guest_id: 'g2', object_id: 'obj-1' })];
    expect(checkSplitHouseholds(plan, objects, [household], assignments)).toEqual([]);
  });

  it('ignores guests not relevant to the plan when deciding whether a household is split', () => {
    const plan = makePlan({ function_id: 'fn-1' });
    const attending = makeGuest({ id: 'g1', functionInvites: [makeInvite({ function_id: 'fn-1', rsvp: 'attending' })] });
    const notAttendingThisFn = makeGuest({ id: 'g2', functionInvites: [makeInvite({ function_id: 'fn-1', rsvp: 'declined' })] });
    const household = makeHousehold({ guests: [attending, notAttendingThisFn] });
    const objects = [makeObject({ id: 'obj-1' }), makeObject({ id: 'obj-2' })];
    // g2 (not attending this function) is seated elsewhere, but should not count towards a split.
    const assignments = [makeAssignment({ guest_id: 'g1', object_id: 'obj-1' }), makeAssignment({ guest_id: 'g2', object_id: 'obj-2' })];
    expect(checkSplitHouseholds(plan, objects, [household], assignments)).toEqual([]);
  });
});

describe('checkPreferenceViolations', () => {
  it('flags a must_together pair seated at different tables', () => {
    const g1 = makeGuest({ id: 'g1', first_name: 'Ari', last_name: null });
    const g2 = makeGuest({ id: 'g2', first_name: 'Ben', last_name: null });
    const household = makeHousehold({ guests: [g1, g2] });
    const index = indexGuests([household]);
    const pref = makePreference({ guest_a: 'g1', guest_b: 'g2', rule: 'must_together' });
    const assignments = [makeAssignment({ guest_id: 'g1', object_id: 'obj-1' }), makeAssignment({ guest_id: 'g2', object_id: 'obj-2' })];

    const warnings = checkPreferenceViolations(assignments, [pref], index);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('error');
    expect(warnings[0].message).toBe('Ari and Ben must be seated together but are at different tables.');
    expect(warnings[0].objectId).toBeUndefined();
  });

  it('does not flag a must_together pair already seated together', () => {
    const pref = makePreference({ guest_a: 'g1', guest_b: 'g2', rule: 'must_together' });
    const assignments = [makeAssignment({ guest_id: 'g1', object_id: 'obj-1' }), makeAssignment({ guest_id: 'g2', object_id: 'obj-1' })];
    expect(checkPreferenceViolations(assignments, [pref], new Map())).toEqual([]);
  });

  it('flags a keep_apart pair seated at the same table, carrying the shared objectId', () => {
    const pref = makePreference({ guest_a: 'g1', guest_b: 'g2', rule: 'keep_apart' });
    const assignments = [makeAssignment({ guest_id: 'g1', object_id: 'obj-1' }), makeAssignment({ guest_id: 'g2', object_id: 'obj-1' })];
    const warnings = checkPreferenceViolations(assignments, [pref], new Map());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ severity: 'error', objectId: 'obj-1' });
    expect(warnings[0].message).toContain('kept apart');
  });

  it('does not flag a keep_apart pair already seated apart', () => {
    const pref = makePreference({ guest_a: 'g1', guest_b: 'g2', rule: 'keep_apart' });
    const assignments = [makeAssignment({ guest_id: 'g1', object_id: 'obj-1' }), makeAssignment({ guest_id: 'g2', object_id: 'obj-2' })];
    expect(checkPreferenceViolations(assignments, [pref], new Map())).toEqual([]);
  });

  it('flags a prefer_together pair apart as a soft info-level warning', () => {
    const pref = makePreference({ guest_a: 'g1', guest_b: 'g2', rule: 'prefer_together' });
    const assignments = [makeAssignment({ guest_id: 'g1', object_id: 'obj-1' }), makeAssignment({ guest_id: 'g2', object_id: 'obj-2' })];
    const warnings = checkPreferenceViolations(assignments, [pref], new Map());
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('info');
  });

  it('does not evaluate a preference until both guests are seated somewhere on this plan', () => {
    const pref = makePreference({ guest_a: 'g1', guest_b: 'g2', rule: 'must_together' });
    const onlyOneSeated = [makeAssignment({ guest_id: 'g1', object_id: 'obj-1' })];
    expect(checkPreferenceViolations(onlyOneSeated, [pref], new Map())).toEqual([]);
  });
});

describe('computeSeatingWarnings', () => {
  it('combines every check and sorts worst severity first', () => {
    const plan = makePlan({ function_id: null });
    const overCapacityObject = makeObject({ id: 'obj-1', capacity: 1 });
    const g1 = makeGuest({ id: 'g1' });
    const g2 = makeGuest({ id: 'g2' });
    const g4 = makeGuest({ id: 'g4' }); // attending, never assigned a seat below

    const assignments = [
      makeAssignment({ guest_id: 'g1', object_id: 'obj-1' }),
      makeAssignment({ guest_id: 'g2', object_id: 'obj-1' }), // pushes obj-1 over its capacity of 1
    ];
    const householdWithUnseated = makeHousehold({ guests: [g1, g2, g4] });

    const warnings = computeSeatingWarnings({
      plan,
      objects: [overCapacityObject],
      assignments,
      households: [householdWithUnseated],
      preferences: [],
    });

    expect(warnings.length).toBeGreaterThanOrEqual(2);
    // First warning must be an error (over-capacity) — nothing softer sorts before it.
    expect(warnings[0].severity).toBe('error');
    const severityOrder = warnings.map((w) => w.severity);
    const rank = { error: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < severityOrder.length; i++) {
      expect(rank[severityOrder[i]]).toBeGreaterThanOrEqual(rank[severityOrder[i - 1]]);
    }
  });

  it('returns nothing for a fully-seated, unconstrained plan', () => {
    const plan = makePlan({ function_id: null });
    const object = makeObject({ id: 'obj-1', capacity: 2 });
    const g1 = makeGuest({ id: 'g1' });
    const g2 = makeGuest({ id: 'g2' });
    const household = makeHousehold({ guests: [g1, g2] });
    const assignments = [makeAssignment({ guest_id: 'g1', object_id: 'obj-1' }), makeAssignment({ guest_id: 'g2', object_id: 'obj-1' })];

    const warnings = computeSeatingWarnings({ plan, objects: [object], assignments, households: [household], preferences: [] });
    expect(warnings).toEqual([]);
  });
});
