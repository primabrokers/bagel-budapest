/**
 * Pure geometry for rendering one `bm_floor_objects` row as an SVG shape, and for laying out its
 * seat positions. `FloorCanvas` and `TableDetailSheet` are the consumers — this module knows
 * nothing about SVG DOM, pointer events or React; it only turns a row's kind/width/height/capacity
 * into numbers.
 *
 * Every shape and every seat slot is expressed in the object's OWN local coordinate frame,
 * centred on (0, 0) — i.e. the frame you get by rendering `<g transform="translate(x,y)
 * rotate(rotation)">` around the object's stored x/y. That is what makes rotation trivial: the
 * caller rotates the whole group, and every point this module returns rotates for free with it.
 */
import type { FloorObjectKind, FloorObjectRow, SeatAssignmentRow } from '../../data/seating/types';

export type ObjectShape = 'circle' | 'rect';

const ROUND_KINDS: ReadonlySet<FloorObjectKind> = new Set(['table_round', 'top_table', 'kids_table']);
const RECT_TABLE_KINDS: ReadonlySet<FloorObjectKind> = new Set(['table_long', 'table_rect', 'table_square']);
const SEATABLE_KINDS: ReadonlySet<FloorObjectKind> = new Set([...ROUND_KINDS, ...RECT_TABLE_KINDS]);

/** Round table kinds render as a circle (radius = the shorter of width/height, halved); every
 *  other kind — including the rectangular table kinds — renders as a plain rectangle. */
export function objectShape(kind: FloorObjectKind): ObjectShape {
  return ROUND_KINDS.has(kind) ? 'circle' : 'rect';
}

/** Whether this kind of floor object can hold seat assignments at all. Non-table furniture
 *  (dance floor, stage, bar, buffet, entrance) and `custom` never get seat slots. */
export function isSeatableKind(kind: FloorObjectKind): boolean {
  return SEATABLE_KINDS.has(kind);
}

export interface CircleGeometry {
  shape: 'circle';
  cx: number;
  cy: number;
  radius: number;
}

export interface RectGeometry {
  shape: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ObjectGeometry = CircleGeometry | RectGeometry;

/** The shape parameters to draw for one object, centred on its own local origin — an SVG
 *  `<circle>` or `<rect>`'s own attributes, minus the group transform `FloorCanvas` applies. */
export function objectGeometry(kind: FloorObjectKind, width: number, height: number): ObjectGeometry {
  if (objectShape(kind) === 'circle') {
    return { shape: 'circle', cx: 0, cy: 0, radius: Math.min(width, height) / 2 };
  }
  return { shape: 'rect', x: -width / 2, y: -height / 2, width, height };
}

export interface SeatSlot {
  x: number;
  y: number;
}

/** How far a seat sits outside the table's own edge, in the same cm units as width/height. */
const SEAT_OFFSET = 26;

export interface Footprint {
  width: number;
  height: number;
}

/**
 * The space a table really occupies: its own top surface PLUS the ring of seated guests around it,
 * `SEAT_OFFSET` on every side. A 150cm round table needs 202cm of floor, not 150 — planning a room
 * on the bare table size is how you end up with a layout where nobody can pull a chair out.
 *
 * Lives here rather than in `roomLayout.ts` so it shares the one definition of `SEAT_OFFSET` with
 * `seatSlots`, which is what actually draws those guests. If the two drifted apart, the planner
 * would promise a fit the canvas then contradicts.
 */
export function tableFootprint(width: number, height: number): Footprint {
  return { width: width + SEAT_OFFSET * 2, height: height + SEAT_OFFSET * 2 };
}

/**
 * Seat positions for one object, in its own local frame (see the module comment). Non-seatable
 * kinds, or a capacity of zero/null/undefined, return an empty array — `FloorCanvas` and
 * `TableDetailSheet` treat that as "nothing to seat here" rather than a special case.
 */
export function seatSlots(
  kind: FloorObjectKind,
  capacity: number | null | undefined,
  width: number,
  height: number,
): SeatSlot[] {
  const count = capacity ?? 0;
  if (count <= 0 || !isSeatableKind(kind)) return [];
  return objectShape(kind) === 'circle'
    ? polarSeatSlots(count, Math.min(width, height) / 2 + SEAT_OFFSET)
    : perimeterSeatSlots(count, width, height);
}

/**
 * Evenly spaced around a ring of the given radius, starting at 12 o'clock and going clockwise —
 * the same convention `lib/chartGeometry.ts`'s `describeArc` uses for its own angle-from-12
 * measurement, so a seat numbered 0 always reads as "the seat facing the room's own 12 o'clock"
 * rather than an arbitrary starting point.
 */
function polarSeatSlots(count: number, radius: number): SeatSlot[] {
  const slots: SeatSlot[] = [];
  for (let i = 0; i < count; i++) {
    const angleRad = ((360 / count) * i * Math.PI) / 180;
    slots.push({ x: radius * Math.sin(angleRad), y: -radius * Math.cos(angleRad) });
  }
  return slots;
}

/**
 * A walk around a rectangle's perimeter, seats spaced evenly along each of the four edges in
 * proportion to its length, offset `SEAT_OFFSET` outside the table's own edge. Sides are visited
 * clockwise (top → right → bottom → left), matching the round tables' own clockwise-from-12
 * convention, though seats are grouped by side rather than interleaved into one continuous ring.
 *
 * Seats are allocated to each side in proportion to its share of the perimeter, rounded down,
 * with any remainder handed to the sides with the largest fractional share first (the "largest
 * remainder" apportionment method) — so an odd capacity favours the longer sides of a long table
 * rather than splitting into even quarters regardless of shape.
 */
function perimeterSeatSlots(count: number, width: number, height: number): SeatSlot[] {
  const halfW = width / 2;
  const halfH = height / 2;
  const perimeter = 2 * (width + height);

  // Order: top, right, bottom, left.
  const sideLengths = [width, height, width, height];
  const raw = sideLengths.map((len) => (len / perimeter) * count);
  const base = raw.map(Math.floor);
  let remaining = count - base.reduce((a, b) => a + b, 0);

  const byFractionDesc = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { index } of byFractionDesc) {
    if (remaining <= 0) break;
    base[index] += 1;
    remaining -= 1;
  }

  const sides: { count: number; pointAt: (t: number) => SeatSlot }[] = [
    { count: base[0], pointAt: (t) => ({ x: -halfW + t * width, y: -halfH - SEAT_OFFSET }) }, // top
    { count: base[1], pointAt: (t) => ({ x: halfW + SEAT_OFFSET, y: -halfH + t * height }) }, // right
    { count: base[2], pointAt: (t) => ({ x: halfW - t * width, y: halfH + SEAT_OFFSET }) }, // bottom
    { count: base[3], pointAt: (t) => ({ x: -halfW - SEAT_OFFSET, y: halfH - t * height }) }, // left
  ];

  const slots: SeatSlot[] = [];
  for (const side of sides) {
    for (let i = 0; i < side.count; i++) {
      // Evenly spaced along the side, inset half a seat's share from each corner — so a seat
      // never lands exactly on a corner, which would visually overlap the adjacent side's seat.
      slots.push(side.pointAt((i + 0.5) / side.count));
    }
  }
  return slots;
}

/**
 * Slot index -> the assignment rendered there, for one object's `seatSlots()` output. Assignments
 * that already carry an explicit `seat_index` claim that exact slot; the rest (seated "at the
 * table", no chair chosen yet — see `assignSeat`'s own seat_index-optional contract) fill
 * whatever slots remain, in assignment order. This is a display-only placement: it never mutates
 * a real assignment's stored `seat_index`, so a plain table-level seating never "locks in" a
 * chair nobody actually chose. Both `FloorCanvas` (the spatial ring) and `TableDetailSheet` (the
 * seat list) render from this so the two views can never disagree about who sits where.
 */
export function assignmentsBySlot(assignments: SeatAssignmentRow[], slotCount: number): Map<number, SeatAssignmentRow> {
  const bySlot = new Map<number, SeatAssignmentRow>();
  const unplaced: SeatAssignmentRow[] = [];
  for (const assignment of assignments) {
    if (assignment.seat_index != null && assignment.seat_index < slotCount && !bySlot.has(assignment.seat_index)) {
      bySlot.set(assignment.seat_index, assignment);
    } else {
      unplaced.push(assignment);
    }
  }
  let nextFreeSlot = 0;
  for (const assignment of unplaced) {
    while (bySlot.has(nextFreeSlot) && nextFreeSlot < slotCount) nextFreeSlot += 1;
    if (nextFreeSlot < slotCount) bySlot.set(nextFreeSlot, assignment);
  }
  return bySlot;
}

const KIND_LABELS: Record<FloorObjectKind, string> = {
  table_round: 'Round table',
  table_long: 'Long table',
  table_rect: 'Rectangular table',
  table_square: 'Square table',
  top_table: 'Top table',
  kids_table: "Kids' table",
  dance_floor: 'Dance floor',
  stage: 'Stage',
  bar: 'Bar',
  buffet: 'Buffet',
  entrance: 'Entrance',
  mechitza: 'Mechitza',
  custom: 'Object',
};

/** The generic label for a kind of floor object — shown when the object has no `label` of its
 *  own, and used to populate the "add object" menu. */
export function floorObjectKindLabel(kind: FloorObjectKind): string {
  return KIND_LABELS[kind];
}

/** Every kind, in the order the "add object" menu offers them — tables first, then room
 *  furniture, `custom` last as the catch-all. */
export const FLOOR_OBJECT_KINDS: readonly FloorObjectKind[] = [
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
  'mechitza',
  'custom',
];

/** The display name for one floor object: its own label, else "Table {n}" for a numbered table,
 *  else a generic kind label. Every seating warning, activity-log summary and CSV export row
 *  goes through this, so a table reads the same way everywhere it appears. */
export function floorObjectLabel(obj: Pick<FloorObjectRow, 'label' | 'table_number' | 'kind'>): string {
  if (obj.label) return obj.label;
  if (obj.table_number != null) return `Table ${obj.table_number}`;
  return floorObjectKindLabel(obj.kind);
}

/**
 * Sensible defaults for a freshly added floor object of this kind — width/height in cm and a
 * starting capacity for seatable kinds. `FloorCanvas`'s add-object menu uses this so a new table
 * lands at a usable size rather than the bare `width: 100, height: 100` column defaults, which
 * would draw a tiny square for what should be a long table.
 */
export function defaultObjectSize(kind: FloorObjectKind): { width: number; height: number; capacity: number | null } {
  switch (kind) {
    case 'table_round':
      return { width: 150, height: 150, capacity: 8 };
    case 'top_table':
      return { width: 300, height: 90, capacity: 10 };
    case 'kids_table':
      return { width: 120, height: 120, capacity: 6 };
    case 'table_long':
      return { width: 240, height: 80, capacity: 8 };
    case 'table_rect':
      return { width: 180, height: 90, capacity: 8 };
    case 'table_square':
      return { width: 120, height: 120, capacity: 8 };
    case 'dance_floor':
      return { width: 300, height: 300, capacity: null };
    case 'stage':
      return { width: 400, height: 200, capacity: null };
    case 'bar':
      return { width: 200, height: 70, capacity: null };
    case 'buffet':
      return { width: 250, height: 80, capacity: null };
    case 'entrance':
      return { width: 100, height: 40, capacity: null };
    case 'mechitza':
      // A partition, not a wall: 6m of run is a sensible starting length a family can drag to fit,
      // and 20cm thick so it is visible and grabbable on a phone-sized canvas.
      return { width: 20, height: 600, capacity: null };
    case 'custom':
    default:
      return { width: 100, height: 100, capacity: null };
  }
}
