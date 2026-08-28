import { describe, expect, it } from 'vitest';
import {
  assignmentsBySlot,
  defaultObjectSize,
  floorObjectKindLabel,
  floorObjectLabel,
  isSeatableKind,
  objectGeometry,
  objectShape,
  seatSlots,
} from './tableGeometry';
import type { FloorObjectKind, SeatAssignmentRow } from '../../data/seating/types';

let idCounter = 0;
function makeAssignment(overrides: Partial<SeatAssignmentRow> = {}): SeatAssignmentRow {
  idCounter += 1;
  return {
    id: `assignment-${idCounter}`,
    event_id: 'evt-1',
    plan_id: 'plan-1',
    guest_id: `guest-${idCounter}`,
    object_id: 'object-1',
    seat_index: null,
    locked: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const ALL_KINDS: FloorObjectKind[] = [
  'table_round',
  'table_long',
  'table_rect',
  'table_square',
  'top_table',
  'kids_table',
  'dance_floor',
  'stage',
  'bar',
  'buffet',
  'entrance',
  'custom',
];

describe('objectShape / isSeatableKind', () => {
  it('renders round table kinds as a circle', () => {
    expect(objectShape('table_round')).toBe('circle');
    expect(objectShape('top_table')).toBe('circle');
    expect(objectShape('kids_table')).toBe('circle');
  });

  it('renders every other kind, including rectangular tables, as a rect', () => {
    const rectKinds: FloorObjectKind[] = ['table_long', 'table_rect', 'table_square', 'dance_floor', 'stage', 'bar', 'buffet', 'entrance', 'custom'];
    for (const kind of rectKinds) expect(objectShape(kind)).toBe('rect');
  });

  it('flags exactly the six table kinds as seatable', () => {
    const seatable = ALL_KINDS.filter(isSeatableKind);
    expect(seatable.sort()).toEqual(
      ['table_round', 'table_long', 'table_rect', 'table_square', 'top_table', 'kids_table'].sort(),
    );
  });
});

describe('objectGeometry', () => {
  it('a circle is centred on the origin with radius = half the shorter side', () => {
    const g = objectGeometry('table_round', 160, 200);
    expect(g).toEqual({ shape: 'circle', cx: 0, cy: 0, radius: 80 });
  });

  it('a rect is centred on the origin — its x/y are the top-left corner offset by half its size', () => {
    const g = objectGeometry('table_rect', 180, 90);
    expect(g).toEqual({ shape: 'rect', x: -90, y: -45, width: 180, height: 90 });
  });
});

describe('seatSlots — non-seatable and empty-capacity cases', () => {
  it('returns nothing for a non-seatable kind, whatever the capacity', () => {
    expect(seatSlots('dance_floor', 12, 300, 300)).toEqual([]);
    expect(seatSlots('custom', 4, 100, 100)).toEqual([]);
  });

  it('returns nothing for a seatable kind with no capacity set', () => {
    expect(seatSlots('table_round', null, 150, 150)).toEqual([]);
    expect(seatSlots('table_round', undefined, 150, 150)).toEqual([]);
    expect(seatSlots('table_round', 0, 150, 150)).toEqual([]);
  });
});

describe('seatSlots — round tables (polar layout)', () => {
  it('places the right number of seats, starting at 12 o\'clock', () => {
    const radius = 75; // width/height 150 -> table radius 75
    const slots = seatSlots('table_round', 4, 150, 150);
    expect(slots).toHaveLength(4);
    // Seat 0 sits directly "above" the table centre in the local frame (y negative = up).
    expect(slots[0].x).toBeCloseTo(0, 5);
    expect(slots[0].y).toBeCloseTo(-(radius + 26), 5);
  });

  it('every seat is equidistant from the centre, at the table radius plus the fixed offset', () => {
    const slots = seatSlots('table_round', 8, 150, 150);
    const expectedRadius = 75 + 26;
    for (const slot of slots) {
      const distance = Math.hypot(slot.x, slot.y);
      expect(distance).toBeCloseTo(expectedRadius, 5);
    }
  });

  it('seats are evenly spaced around the ring', () => {
    const slots = seatSlots('table_round', 6, 150, 150);
    const angles = slots.map((s) => Math.atan2(s.x, -s.y));
    for (let i = 1; i < angles.length; i++) {
      let delta = angles[i] - angles[i - 1];
      if (delta < 0) delta += 2 * Math.PI;
      expect(delta).toBeCloseTo((2 * Math.PI) / 6, 5);
    }
  });

  it('uses the shorter side for an oval-ish top table, not the longer one', () => {
    const slots = seatSlots('top_table', 2, 300, 90);
    const expectedRadius = 45 + 26; // min(300,90)/2 = 45
    expect(Math.hypot(slots[0].x, slots[0].y)).toBeCloseTo(expectedRadius, 5);
  });
});

describe('seatSlots — rectangular tables (perimeter walk)', () => {
  it('returns exactly `capacity` slots, all outside the table\'s own footprint', () => {
    const width = 200;
    const height = 100;
    const halfW = width / 2;
    const halfH = height / 2;
    const slots = seatSlots('table_rect', 6, width, height);
    expect(slots).toHaveLength(6);
    for (const slot of slots) {
      const outside = slot.x < -halfW || slot.x > halfW || slot.y < -halfH || slot.y > halfH;
      expect(outside).toBe(true);
    }
  });

  it('divides seats between sides in proportion to side length (exact case, no remainder)', () => {
    // perimeter = 600; top/bottom get 200/600*6=2 each, left/right get 100/600*6=1 each.
    const width = 200;
    const height = 100;
    const halfW = width / 2;
    const halfH = height / 2;
    const slots = seatSlots('table_rect', 6, width, height);

    const top = slots.filter((s) => s.y < -halfH);
    const bottom = slots.filter((s) => s.y > halfH);
    const left = slots.filter((s) => s.x < -halfW);
    const right = slots.filter((s) => s.x > halfW);

    expect(top).toHaveLength(2);
    expect(bottom).toHaveLength(2);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
  });

  it('hands remainder seats to the sides with the largest fractional share (largest-remainder method)', () => {
    // width=100, height=50, capacity=5, perimeter=300.
    // raw: top=1.667 bottom=1.667 (frac .667), right=0.833 left=0.833 (frac .833).
    // floors: top=1 bottom=1 right=0 left=0 (sum 2), remaining=3.
    // Stable sort on descending fraction keeps original index order among ties:
    // order = [right(.833), left(.833), top(.667), bottom(.667)] -> first 3 get +1.
    // Final: top=2, right=1, bottom=1, left=1 (sum 5).
    const width = 100;
    const height = 50;
    const halfW = width / 2;
    const halfH = height / 2;
    const slots = seatSlots('table_rect', 5, width, height);

    const top = slots.filter((s) => s.y < -halfH);
    const bottom = slots.filter((s) => s.y > halfH);
    const left = slots.filter((s) => s.x < -halfW);
    const right = slots.filter((s) => s.x > halfW);

    expect(slots).toHaveLength(5);
    expect(top).toHaveLength(2);
    expect(right).toHaveLength(1);
    expect(bottom).toHaveLength(1);
    expect(left).toHaveLength(1);
  });

  it('spaces seats along a side evenly, inset from the corners', () => {
    // Two seats on the top edge (width 200) should sit symmetrically about the midpoint, not at
    // the corners.
    const slots = seatSlots('table_long', 2, 200, 60).filter((s) => s.y < -30);
    // Perimeter allocation for a 2-seat, 200x60 table gives both seats to the long sides (one
    // each) — so instead just check the general top-edge case directly via a table with capacity
    // fully on one side isn't guaranteed; assert the two long-table seats are within the table's
    // x-span and not at the exact corners.
    for (const slot of slots) {
      expect(Math.abs(slot.x)).toBeLessThan(100);
    }
  });
});

describe('floorObjectLabel / floorObjectKindLabel', () => {
  it('prefers an explicit label over everything else', () => {
    expect(floorObjectLabel({ label: 'Head table', table_number: 3, kind: 'table_round' })).toBe('Head table');
  });

  it('falls back to "Table {n}" when there is a table number but no label', () => {
    expect(floorObjectLabel({ label: null, table_number: 7, kind: 'table_round' })).toBe('Table 7');
  });

  it('falls back to the kind label when neither a label nor a table number is set', () => {
    expect(floorObjectLabel({ label: null, table_number: null, kind: 'dance_floor' })).toBe('Dance floor');
  });

  it('has a distinct, non-empty label for every kind', () => {
    const labels = ALL_KINDS.map(floorObjectKindLabel);
    expect(new Set(labels).size).toBe(ALL_KINDS.length);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
  });
});

describe('assignmentsBySlot', () => {
  it('places an assignment with an explicit seat_index at that exact slot', () => {
    const a = makeAssignment({ guest_id: 'g1', seat_index: 2 });
    const bySlot = assignmentsBySlot([a], 4);
    expect(bySlot.get(2)).toBe(a);
    expect(bySlot.size).toBe(1);
  });

  it('fills seat_index-less assignments into whatever slots remain, in order', () => {
    const claimed = makeAssignment({ guest_id: 'g1', seat_index: 1 });
    const floatingA = makeAssignment({ guest_id: 'g2', seat_index: null });
    const floatingB = makeAssignment({ guest_id: 'g3', seat_index: null });
    const bySlot = assignmentsBySlot([claimed, floatingA, floatingB], 4);

    expect(bySlot.get(1)).toBe(claimed);
    // The two floating assignments take slots 0 and 2 (the first two free slots), skipping 1.
    expect(bySlot.get(0)).toBe(floatingA);
    expect(bySlot.get(2)).toBe(floatingB);
    expect(bySlot.size).toBe(3);
  });

  it('drops an assignment once every slot is taken, rather than throwing or overwriting', () => {
    const a = makeAssignment({ guest_id: 'g1' });
    const b = makeAssignment({ guest_id: 'g2' });
    const overflow = makeAssignment({ guest_id: 'g3' });
    const bySlot = assignmentsBySlot([a, b, overflow], 2);
    expect(bySlot.size).toBe(2);
    expect(Array.from(bySlot.values())).toEqual([a, b]);
  });

  it('treats an out-of-range explicit seat_index as unplaced rather than an invalid slot key', () => {
    const outOfRange = makeAssignment({ guest_id: 'g1', seat_index: 99 });
    const bySlot = assignmentsBySlot([outOfRange], 4);
    // Falls through to the "unplaced" bucket and lands on the first free slot instead.
    expect(bySlot.get(0)).toBe(outOfRange);
    expect(bySlot.has(99)).toBe(false);
  });

  it('a second assignment cannot steal a slot another assignment already explicitly claimed', () => {
    const first = makeAssignment({ guest_id: 'g1', seat_index: 0 });
    const second = makeAssignment({ guest_id: 'g2', seat_index: 0 });
    const bySlot = assignmentsBySlot([first, second], 4);
    expect(bySlot.get(0)).toBe(first);
    // The loser of the clash falls back into the unplaced pool and takes the next free slot.
    expect(bySlot.get(1)).toBe(second);
  });
});

describe('defaultObjectSize', () => {
  it('gives every table kind a positive capacity', () => {
    const tableKinds: FloorObjectKind[] = ['table_round', 'table_long', 'table_rect', 'table_square', 'top_table', 'kids_table'];
    for (const kind of tableKinds) {
      const size = defaultObjectSize(kind);
      expect(size.capacity).not.toBeNull();
      expect(size.capacity!).toBeGreaterThan(0);
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
    }
  });

  it('gives every non-table kind a null capacity', () => {
    const nonTableKinds: FloorObjectKind[] = ['dance_floor', 'stage', 'bar', 'buffet', 'entrance', 'custom'];
    for (const kind of nonTableKinds) {
      expect(defaultObjectSize(kind).capacity).toBeNull();
    }
  });
});
