import { describe, expect, it } from 'vitest';
import { autoSeat, type AutoSeatInput } from './autoSeat';
import type { GuestWithDetails, HouseholdWithGuests } from '../../data/guests/types';
import type {
  FloorObjectRow,
  SeatAssignmentRow,
  SeatingPlanRow,
  SeatingPreferenceRow,
} from '../../data/seating/types';

/**
 * The hard constraints are the point of this module, so most of these assert something can never
 * happen — over capacity, a `keep_apart` pair sharing a table, a guest on the wrong side of the
 * mechitza — rather than checking a particular arrangement, which would just pin today's tie-break
 * order in place.
 */

const EVENT = 'event-1';

function guest(id: string, householdId: string, overrides: Partial<GuestWithDetails> = {}): GuestWithDetails {
  return {
    id,
    event_id: EVENT,
    household_id: householdId,
    first_name: id,
    last_name: null,
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
    created_at: '',
    updated_at: '',
    tagIds: [],
    // A whole-event plan counts a guest as relevant when any invite is `attending`.
    functionInvites: [
      {
        id: `inv-${id}`,
        event_id: EVENT,
        guest_id: id,
        function_id: 'fn-1',
        invited: true,
        rsvp: 'attending',
        responded_at: null,
        created_at: '',
        updated_at: '',
      },
    ],
    ...overrides,
  };
}

function household(id: string, guests: GuestWithDetails[]): HouseholdWithGuests {
  return {
    id,
    event_id: EVENT,
    name: id,
    main_contact_name: null,
    address_lines: null,
    postcode: null,
    email: null,
    phone: null,
    whatsapp: null,
    category: null,
    side_of_family: null,
    notes: null,
    created_at: '',
    updated_at: '',
    created_by: null,
    tagIds: [],
    guests,
  };
}

function table(id: string, capacity: number, x = 0, y = 0): FloorObjectRow {
  return {
    id,
    event_id: EVENT,
    plan_id: 'plan-1',
    kind: 'table_round',
    label: id,
    table_number: null,
    capacity,
    x,
    y,
    width: 150,
    height: 150,
    rotation: 0,
    locked: false,
    notes: null,
    created_at: '',
    updated_at: '',
  };
}

function mechitza(x: number, y: number, width: number, height: number): FloorObjectRow {
  return { ...table('mechitza-1', 0, x, y), kind: 'mechitza', capacity: null, width, height };
}

const PLAN: SeatingPlanRow = {
  id: 'plan-1',
  event_id: EVENT,
  function_id: null,
  name: 'Main',
  created_at: '',
  updated_at: '',
} as SeatingPlanRow;

function pref(a: string, b: string, rule: SeatingPreferenceRow['rule']): SeatingPreferenceRow {
  const [guest_a, guest_b] = [a, b].sort();
  return { id: `${a}-${b}`, event_id: EVENT, guest_a, guest_b, rule, note: null, created_at: '', updated_at: '' } as SeatingPreferenceRow;
}

function run(overrides: Partial<AutoSeatInput> & Pick<AutoSeatInput, 'households' | 'objects'>) {
  return autoSeat({ plan: PLAN, preferences: [], existing: [], ...overrides });
}

/** Table id -> guest ids seated there. */
function seating(result: { assignments: { guestId: string; objectId: string }[] }): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const a of result.assignments) {
    map.set(a.objectId, [...(map.get(a.objectId) ?? []), a.guestId]);
  }
  return map;
}

describe('autoSeat — basics', () => {
  it('seats everyone when there is room', () => {
    const guests = [guest('a', 'h1'), guest('b', 'h1'), guest('c', 'h2')];
    const result = run({ households: [household('h1', guests.slice(0, 2)), household('h2', guests.slice(2))], objects: [table('t1', 8)] });
    expect(result.unseated).toEqual([]);
    expect(result.assignments).toHaveLength(3);
  });

  it('never exceeds a table capacity', () => {
    const guests = Array.from({ length: 10 }, (_, i) => guest(`g${i}`, `h${i}`));
    const result = run({
      households: guests.map((g) => household(g.household_id, [g])),
      objects: [table('t1', 4), table('t2', 4)],
    });
    for (const [, seated] of seating(result)) expect(seated.length).toBeLessThanOrEqual(4);
    expect(result.unseated).toHaveLength(2);
  });

  it('reports unseated guests rather than inventing seats', () => {
    const guests = [guest('a', 'h1'), guest('b', 'h1')];
    const result = run({ households: [household('h1', guests)], objects: [table('t1', 1)] });
    expect(result.unseated).toHaveLength(1);
    expect(result.warnings.join(' ')).toMatch(/could not be seated/i);
  });

  it('ignores guests who are not attending', () => {
    const going = guest('a', 'h1');
    const declined = guest('b', 'h1', {
      functionInvites: [
        { id: 'inv-b', event_id: EVENT, guest_id: 'b', function_id: 'fn-1', invited: true, rsvp: 'declined', responded_at: null, created_at: '', updated_at: '' },
      ],
    });
    const result = run({ households: [household('h1', [going, declined])], objects: [table('t1', 8)] });
    expect(result.assignments.map((a) => a.guestId)).toEqual(['a']);
  });

  it('is deterministic — the same input twice gives the same plan', () => {
    const guests = Array.from({ length: 12 }, (_, i) => guest(`g${i}`, `h${i % 3}`));
    const households = ['h0', 'h1', 'h2'].map((h) => household(h, guests.filter((g) => g.household_id === h)));
    const objects = [table('t1', 8, 0, 0), table('t2', 8, 500, 0)];
    expect(run({ households, objects })).toEqual(run({ households, objects }));
  });

  it('places nothing when there are no tables, without throwing', () => {
    const result = run({ households: [household('h1', [guest('a', 'h1')])], objects: [] });
    expect(result.assignments).toEqual([]);
    expect(result.unseated).toEqual(['a']);
  });
});

describe('autoSeat — hard constraints', () => {
  it('never seats a keep_apart pair at the same table', () => {
    const guests = [guest('a', 'h1'), guest('b', 'h2')];
    const result = run({
      households: [household('h1', [guests[0]]), household('h2', [guests[1]])],
      objects: [table('t1', 8), table('t2', 8)],
      preferences: [pref('a', 'b', 'keep_apart')],
    });
    const byTable = seating(result);
    for (const [, seated] of byTable) {
      expect(seated.includes('a') && seated.includes('b')).toBe(false);
    }
  });

  it('leaves a guest unseated rather than violating keep_apart when only one table exists', () => {
    const guests = [guest('a', 'h1'), guest('b', 'h2')];
    const result = run({
      households: [household('h1', [guests[0]]), household('h2', [guests[1]])],
      objects: [table('t1', 8)],
      preferences: [pref('a', 'b', 'keep_apart')],
    });
    expect(result.unseated).toHaveLength(1);
  });

  it('always seats a must_together pair at the same table', () => {
    const guests = [guest('a', 'h1'), guest('b', 'h2'), guest('c', 'h3'), guest('d', 'h4')];
    const result = run({
      households: guests.map((g) => household(g.household_id, [g])),
      objects: [table('t1', 2), table('t2', 2)],
      preferences: [pref('a', 'b', 'must_together')],
    });
    const byTable = seating(result);
    const tableOfA = [...byTable.entries()].find(([, s]) => s.includes('a'))?.[0];
    expect(byTable.get(tableOfA ?? '')).toContain('b');
  });

  it('merges a must_together chain into one table', () => {
    const guests = [guest('a', 'h1'), guest('b', 'h2'), guest('c', 'h3')];
    const result = run({
      households: guests.map((g) => household(g.household_id, [g])),
      objects: [table('t1', 8), table('t2', 8)],
      preferences: [pref('a', 'b', 'must_together'), pref('b', 'c', 'must_together')],
    });
    const byTable = seating(result);
    const tableOfA = [...byTable.entries()].find(([, s]) => s.includes('a'))?.[0];
    expect(byTable.get(tableOfA ?? '')).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('leaves a must_together group unseated rather than splitting it', () => {
    const guests = [guest('a', 'h1'), guest('b', 'h2'), guest('c', 'h3')];
    const result = run({
      households: guests.map((g) => household(g.household_id, [g])),
      // Two tables of two: the trio fits nowhere as a unit.
      objects: [table('t1', 2), table('t2', 2)],
      preferences: [pref('a', 'b', 'must_together'), pref('b', 'c', 'must_together')],
    });
    expect(result.unseated).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('keeps a locked assignment exactly where it is', () => {
    const guests = [guest('a', 'h1'), guest('b', 'h1')];
    const existing: SeatAssignmentRow[] = [
      { id: 'sa1', event_id: EVENT, plan_id: 'plan-1', guest_id: 'a', object_id: 't2', seat_index: null, locked: true, created_at: '', updated_at: '' },
    ];
    const result = run({ households: [household('h1', guests)], objects: [table('t1', 8), table('t2', 8)], existing });
    expect(result.assignments).toContainEqual({ guestId: 'a', objectId: 't2' });
  });

  it('counts a locked guest against their table capacity', () => {
    const locked = guest('a', 'h1');
    const others = [guest('b', 'h2'), guest('c', 'h3')];
    const existing: SeatAssignmentRow[] = [
      { id: 'sa1', event_id: EVENT, plan_id: 'plan-1', guest_id: 'a', object_id: 't1', seat_index: null, locked: true, created_at: '', updated_at: '' },
    ];
    const result = run({
      households: [household('h1', [locked]), household('h2', [others[0]]), household('h3', [others[1]])],
      objects: [table('t1', 2)],
      existing,
    });
    // Capacity 2, one already locked in: exactly one more fits, one is unseated.
    expect(result.unseated).toHaveLength(1);
  });
});

describe('autoSeat — mechitza and separate seating', () => {
  // Tall thin partition at x=500 divides the room left/right.
  const partition = mechitza(500, 400, 20, 800);
  const leftTable = table('left', 8, 200, 400);
  const rightTable = table('right', 8, 800, 400);
  const objects = [partition, leftTable, rightTable];

  const men = [guest('m1', 'h1', { gender: 'male' }), guest('m2', 'h2', { gender: 'male' })];
  const women = [guest('w1', 'h3', { gender: 'female' }), guest('w2', 'h4', { gender: 'female' })];
  const households = [...men, ...women].map((g) => household(g.household_id, [g]));

  it('puts men and women on opposite sides when separate seating is on', () => {
    const result = run({ households, objects, separateSeating: true });
    const byTable = seating(result);
    const left = byTable.get('left') ?? [];
    const right = byTable.get('right') ?? [];
    const menSides = new Set(men.map((g) => (left.includes(g.id) ? 'left' : right.includes(g.id) ? 'right' : 'none')));
    const womenSides = new Set(women.map((g) => (left.includes(g.id) ? 'left' : right.includes(g.id) ? 'right' : 'none')));
    expect(menSides.size).toBe(1);
    expect(womenSides.size).toBe(1);
    expect([...menSides][0]).not.toBe([...womenSides][0]);
  });

  it('does not divide by gender when separate seating is off, even with a mechitza present', () => {
    const result = run({ households, objects, separateSeating: false });
    // Everyone fits on one table, and nothing forces a split.
    expect(result.unseated).toEqual([]);
    expect(seating(result).size).toBe(1);
  });

  it('leaves a guest with no gender recorded unconstrained rather than guessing', () => {
    const unknown = guest('u1', 'h9');
    const result = run({ households: [...households, household('h9', [unknown])], objects, separateSeating: true });
    expect(result.unseated).not.toContain('u1');
  });

  it('keeps a mixed-gender must_together group together and says why', () => {
    const couple = [guest('p1', 'h1', { gender: 'male' }), guest('p2', 'h1', { gender: 'female' })];
    const result = run({
      households: [household('h1', couple)],
      objects,
      separateSeating: true,
      preferences: [pref('p1', 'p2', 'must_together')],
    });
    const byTable = seating(result);
    const tableOfP1 = [...byTable.entries()].find(([, s]) => s.includes('p1'))?.[0];
    expect(byTable.get(tableOfP1 ?? '')).toContain('p2');
    expect(result.warnings.join(' ')).toMatch(/different genders/i);
  });

  it('warns when separate seating is on but no mechitza exists', () => {
    const result = run({ households, objects: [leftTable, rightTable], separateSeating: true });
    expect(result.warnings.join(' ')).toMatch(/no mechitza/i);
  });

  it('reads a wide flat partition as dividing the room top/bottom', () => {
    const flat = mechitza(500, 400, 1000, 20);
    const top = table('top', 8, 500, 100);
    const bottom = table('bottom', 8, 500, 700);
    const result = run({ households, objects: [flat, top, bottom], separateSeating: true });
    const byTable = seating(result);
    const inTop = byTable.get('top') ?? [];
    expect(men.every((g) => inTop.includes(g.id)) || women.every((g) => inTop.includes(g.id))).toBe(true);
  });
});

describe('autoSeat — preferences', () => {
  it('seats a household together when it can', () => {
    const family = [guest('a', 'h1'), guest('b', 'h1'), guest('c', 'h1')];
    const other = guest('z', 'h2');
    const result = run({
      households: [household('h1', family), household('h2', [other])],
      objects: [table('t1', 4, 0, 0), table('t2', 4, 500, 0)],
    });
    const byTable = seating(result);
    const tableOfA = [...byTable.entries()].find(([, s]) => s.includes('a'))?.[0];
    expect(byTable.get(tableOfA ?? '')).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('honours prefer_together when there is a free choice of table', () => {
    const guests = [guest('a', 'h1'), guest('b', 'h2')];
    const result = run({
      households: [household('h1', [guests[0]]), household('h2', [guests[1]])],
      objects: [table('t1', 8, 0, 0), table('t2', 8, 500, 0)],
      preferences: [pref('a', 'b', 'prefer_together')],
    });
    const byTable = seating(result);
    const tableOfA = [...byTable.entries()].find(([, s]) => s.includes('a'))?.[0];
    expect(byTable.get(tableOfA ?? '')).toContain('b');
  });
});
